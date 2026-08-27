const logoSrc = "/images/Polygonal%20%27N%27%20Monogram%20with%20Interlocking%20Shapes%20%281%29.png"

export default function LogoMark({ className = '', alt = 'Nexora' }) {
  return <img src={logoSrc} alt={alt} className={`object-contain ${className}`} />
}
