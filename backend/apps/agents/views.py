from django.core import signing
from django.db import DatabaseError, transaction
from django.db.models import Count, OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, throttling
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import BuyerSearchRequestSerializer, GrowthOfferResponseSerializer
from .conversation_tokens import (
    issue_anonymous_conversation_token,
    read_anonymous_conversation_token,
)
from .models import (
    AgentSession,
    ChatConversation,
    ChatMessage,
    GrowthOffer,
    RecommendationDecision,
)
from .services import run_buyer_agent
from apps.merchants.models import Product, ProductRelationship
from apps.orders.tokens import (
    issue_decision_token,
    issue_growth_offer_token,
    read_growth_offer_token,
)


def _conversation_title(query):
    compact = " ".join(query.split())
    return compact[:117] + "..." if len(compact) > 120 else compact


def _resolve_conversation(request, validated_data):
    conversation_id = validated_data.get("conversation_id")
    if request.user.is_authenticated:
        if conversation_id:
            return get_object_or_404(
                ChatConversation, conversation_id=conversation_id, buyer=request.user
            )
        return ChatConversation.objects.create(
            buyer=request.user, title=_conversation_title(validated_data["query"])
        )

    token = validated_data.get("conversation_token")
    if conversation_id and token:
        try:
            payload = read_anonymous_conversation_token(token)
        except (signing.BadSignature, signing.SignatureExpired) as exc:
            raise signing.BadSignature("Anonymous conversation token is invalid or expired.") from exc
        if payload.get("conversation_id") != str(conversation_id):
            raise signing.BadSignature("Anonymous conversation token does not match.")
        return get_object_or_404(
            ChatConversation, conversation_id=conversation_id, buyer__isnull=True
        )
    return ChatConversation.objects.create(
        buyer=None, title=_conversation_title(validated_data["query"])
    )


def _history_metadata(result):
    def strip_tokens(items):
        return [
            {key: value for key, value in item.items() if not key.endswith("_token")}
            for item in items
        ]

    return {
        "recommendations": strip_tokens(result.get("recommendations", [])),
        "add_on_suggestions": strip_tokens(result.get("add_on_suggestions", [])),
        "provider_source": result.get("provider_source"),
        "agent_session_id": result.get("agent_session_id"),
    }


@transaction.atomic
def _persist_public_decision_trace(request, query, result, conversation):
    context = result.pop("_audit_context", {})
    add_on_suggestions = result.pop("add_on_suggestions", [])
    session = AgentSession.objects.create(
        buyer=request.user if request.user.is_authenticated else None,
        conversation=conversation,
        user_request=query,
        parsed_constraints=context.get("parsed_constraints", {}),
        catalog_candidate_ids=context.get("catalog_candidate_ids", []),
        provider_source=context.get("provider_source", AgentSession.Source.FALLBACK),
        decision_summary=result.get("summary_reasoning", "Recommendation search completed."),
    )
    product_ids = [item["product_id"] for item in result.get("recommendations", [])]
    products = Product.objects.select_related("merchant").in_bulk(product_ids)
    recommendation_payloads = []
    decisions_by_product = {}
    for rank, recommendation in enumerate(result.get("recommendations", []), start=1):
        product = products.get(recommendation["product_id"])
        if product is None:
            continue
        decision = RecommendationDecision.objects.create(
            session=session,
            product=product,
            rank=rank,
            explanation=recommendation["reason"],
            trade_offs=recommendation.get("tradeoffs", []),
            catalog_snapshot={
                "title": product.title,
                "merchant": product.merchant.name,
                "unit_price": str(product.price),
                "currency": "INR",
                "stock_quantity": product.stock_quantity,
                "is_active": product.is_active,
            },
        )
        decisions_by_product[product.id] = decision
        recommendation_payloads.append(
            {
                **recommendation,
                "decision_id": str(decision.decision_id),
                "decision_token": issue_decision_token(session, decision),
            }
        )
    result["recommendations"] = recommendation_payloads
    add_on_payloads = []
    if recommendation_payloads:
        primary_decision = decisions_by_product[recommendation_payloads[0]["product_id"]]
        relationship_ids = [item["relationship_id"] for item in add_on_suggestions]
        relationships = ProductRelationship.objects.select_related(
            "source_product", "related_product__merchant"
        ).in_bulk(relationship_ids)
        for index, suggestion in enumerate(add_on_suggestions, start=1):
            relationship = relationships.get(suggestion["relationship_id"])
            if (
                relationship is None
                or relationship.source_product_id != primary_decision.product_id
                or relationship.related_product_id != suggestion["product_id"]
                or not relationship.is_active
                or not relationship.related_product.is_active
                or relationship.related_product.stock_quantity < 1
            ):
                continue
            product = relationship.related_product
            addon_decision = decisions_by_product.get(product.id)
            if addon_decision is None:
                addon_decision = RecommendationDecision.objects.create(
                    session=session,
                    product=product,
                    rank=100 + index,
                    explanation=suggestion["benefit"],
                    trade_offs=[suggestion["trade_off"]] if suggestion.get("trade_off") else [],
                    catalog_snapshot={
                        "title": product.title,
                        "merchant": product.merchant.name,
                        "unit_price": str(product.price),
                        "currency": "INR",
                        "stock_quantity": product.stock_quantity,
                        "is_active": product.is_active,
                        "relationship_type": relationship.relationship_type,
                        "compatibility": relationship.compatibility,
                    },
                )
                decisions_by_product[product.id] = addon_decision
            offer = GrowthOffer.objects.create(
                session=session,
                primary_decision=primary_decision,
                addon_decision=addon_decision,
                relationship=relationship,
                product=product,
                explanation=suggestion["benefit"],
                trade_off=suggestion.get("trade_off", ""),
                incremental_cost=product.price,
            )
            add_on_payloads.append(
                {
                    **suggestion,
                    "offer_id": str(offer.offer_id),
                    "offer_token": issue_growth_offer_token(offer),
                    "decision_id": str(addon_decision.decision_id),
                    "decision_token": issue_decision_token(session, addon_decision),
                }
            )
    result["add_on_suggestions"] = add_on_payloads
    result["agent_session_id"] = str(session.session_id)
    result["provider_source"] = session.provider_source
    ChatMessage.objects.create(
        conversation=conversation, role=ChatMessage.Role.USER, content=query
    )
    ChatMessage.objects.create(
        conversation=conversation,
        role=ChatMessage.Role.ASSISTANT,
        content=result.get("summary_reasoning", "Search completed."),
        metadata=_history_metadata(result),
    )
    conversation.save(update_fields=["updated_at"])
    result["conversation_id"] = str(conversation.conversation_id)
    if conversation.buyer_id is None:
        result["conversation_token"] = issue_anonymous_conversation_token(conversation)
    return result


class BuyerAgentSearchView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [throttling.ScopedRateThrottle]
    throttle_scope = "agent_search"

    def post(self, request):
        serializer = BuyerSearchRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data["query"]
        try:
            conversation = _resolve_conversation(request, serializer.validated_data)
            result = run_buyer_agent(query)
            result = _persist_public_decision_trace(request, query, result, conversation)
        except signing.BadSignature as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except DatabaseError:
            return Response(
                {"detail": "The product catalog is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)


class BuyerConversationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        latest_message = ChatMessage.objects.filter(conversation=OuterRef("pk")).order_by(
            "-created_at"
        )
        conversations = (
            ChatConversation.objects.filter(buyer=request.user)
            .annotate(
                message_count=Count("messages"),
                last_message=Subquery(latest_message.values("content")[:1]),
            )[:50]
        )
        return Response(
            {
                "results": [
                    {
                        "conversation_id": str(item.conversation_id),
                        "title": item.title,
                        "updated_at": item.updated_at,
                        "message_count": item.message_count,
                        "last_message_preview": (item.last_message or "")[:140],
                    }
                    for item in conversations
                ]
            }
        )


class BuyerConversationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            ChatConversation.objects.prefetch_related("messages"),
            conversation_id=conversation_id,
            buyer=request.user,
        )
        return Response(
            {
                "conversation_id": str(conversation.conversation_id),
                "title": conversation.title,
                "updated_at": conversation.updated_at,
                "messages": [
                    {
                        "message_id": str(message.message_id),
                        "role": message.role,
                        "content": message.content,
                        "metadata": message.metadata,
                        "created_at": message.created_at,
                    }
                    for message in conversation.messages.all()
                ],
            }
        )

    @transaction.atomic
    def delete(self, request, conversation_id):
        conversation = get_object_or_404(
            ChatConversation.objects.select_for_update(),
            conversation_id=conversation_id,
            buyer=request.user,
        )
        # Durable commerce decisions and money audits must survive a UI-history
        # deletion, so detach their nullable conversation link before removing
        # the conversation and its cascading chat messages.
        AgentSession.objects.filter(conversation=conversation).update(conversation=None)
        conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GrowthOfferResponseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, offer_id):
        serializer = GrowthOfferResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = read_growth_offer_token(serializer.validated_data["offer_token"])
        except (signing.BadSignature, signing.SignatureExpired):
            return Response({"detail": "The add-on offer is invalid or expired."}, status=400)
        if payload.get("offer_id") != str(offer_id):
            return Response({"detail": "The add-on offer token does not match."}, status=400)
        target = (
            GrowthOffer.Response.ACCEPTED
            if serializer.validated_data["accepted"]
            else GrowthOffer.Response.REJECTED
        )
        with transaction.atomic():
            try:
                offer = GrowthOffer.objects.select_for_update().select_related(
                    "session", "product", "relationship"
                ).get(pk=offer_id)
            except GrowthOffer.DoesNotExist:
                return Response({"detail": "Add-on offer not found."}, status=404)
            if (
                payload.get("session_id") != str(offer.session_id)
                or payload.get("decision_id") != str(offer.addon_decision_id)
                or payload.get("product_id") != offer.product_id
            ):
                return Response({"detail": "The add-on offer token is invalid."}, status=400)
            if offer.session.buyer_id not in (None, request.user.id):
                return Response({"detail": "Add-on offer not found."}, status=404)
            if offer.response != GrowthOffer.Response.PENDING:
                if offer.response != target or offer.buyer_id != request.user.id:
                    return Response(
                        {"detail": "This add-on response is already final."}, status=409
                    )
                return Response(
                    {"offer_id": str(offer.offer_id), "response": offer.response, "replay": True}
                )
            if target == GrowthOffer.Response.ACCEPTED and (
                not offer.relationship.is_active
                or not offer.product.is_active
                or offer.product.stock_quantity < 1
                or offer.product.price != offer.incremental_cost
            ):
                return Response(
                    {"detail": "This add-on is no longer eligible; no item was added."}, status=409
                )
            if offer.session.buyer_id is None:
                offer.session.buyer = request.user
                offer.session.save(update_fields=["buyer"])
                if (
                    offer.session.conversation_id
                    and offer.session.conversation.buyer_id is None
                ):
                    offer.session.conversation.buyer = request.user
                    offer.session.conversation.save(update_fields=["buyer", "updated_at"])
            offer.response = target
            offer.buyer = request.user
            offer.responded_at = timezone.now()
            offer.save(update_fields=["response", "buyer", "responded_at"])
        return Response({"offer_id": str(offer.offer_id), "response": offer.response, "replay": False})
