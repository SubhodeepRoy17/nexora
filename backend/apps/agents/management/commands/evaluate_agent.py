import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.agents.evaluation import evaluate_dataset, load_dataset, render_markdown


class Command(BaseCommand):
    help = "Generate the rollback-only P0.6 recommendation and growth evaluation report."

    def add_arguments(self, parser):
        root = settings.BASE_DIR.parent
        parser.add_argument(
            "--dataset",
            type=Path,
            default=root / "docs" / "evaluation" / "buyer_intents.json",
        )
        parser.add_argument(
            "--output",
            type=Path,
            default=root / "docs" / "Evaluation.md",
        )
        parser.add_argument(
            "--json-output",
            type=Path,
            default=root / "docs" / "evaluation" / "results.json",
        )

    def handle(self, *args, **options):
        dataset_path = options["dataset"].resolve()
        output_path = options["output"].resolve()
        json_path = options["json_output"].resolve()
        try:
            dataset = load_dataset(dataset_path)
            report = evaluate_dataset(dataset, dataset_path=dataset_path)
        except (OSError, ValueError) as exc:
            raise CommandError(str(exc)) from exc

        output_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(render_markdown(report), encoding="utf-8")
        json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        self.stdout.write(
            self.style.SUCCESS(
                f"P0.6 evaluation {'passed' if report['thresholds_passed'] else 'failed'}: "
                f"{len(dataset['scenarios'])} intents x 2 pathways; report={output_path}"
            )
        )
        if not report["thresholds_passed"]:
            failed = [name for name, threshold in report["thresholds"].items() if (
                report["metrics"][name] > threshold
                if name == "unsupported_claim_rate_percent"
                else report["metrics"][name] < threshold
            )]
            raise CommandError(f"Evaluation thresholds failed: {', '.join(failed)}")
