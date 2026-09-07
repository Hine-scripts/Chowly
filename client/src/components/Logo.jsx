import { useChowly } from "../context/ChowlyContext";

function Logo({ large = false }) {
  const { theme } = useChowly();

  if (!theme) {
    return (
      <div className={`logo ${large ? "logo-large" : ""}`}>
        <span className="logo-mark">C</span>
        <span>Chowly</span>
      </div>
    );
  }

  return (
    <div className={`logo ${large ? "logo-large" : ""}`}>
      <span className="restaurant-logo-mark">{theme.logo}</span>

      <div className="logo-text">
        <strong>{theme.name}</strong>
        <small>by Chowly</small>
      </div>
    </div>
  );
}

export default Logo;