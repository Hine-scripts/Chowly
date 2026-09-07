import { useNavigate } from "react-router-dom";
import { useChowly } from "../context/ChowlyContext";

function RestaurantCard({ restaurant }) {
  const navigate = useNavigate();
  const { setSelectedRestaurant, restaurantThemes } = useChowly();

  const theme = restaurantThemes[restaurant.id];

  function enterRestaurant() {
    setSelectedRestaurant(restaurant);
    navigate(`/restaurant/${restaurant.id}`);
  }

  return (
    <button
      className="restaurant-card"
      style={{
        "--restaurant-primary": theme?.primary,
        "--restaurant-secondary": theme?.secondary,
      }}
      onClick={enterRestaurant}
    >
      <div className="restaurant-card-icon">
        {theme?.logo || "🍽️"}
      </div>

      <div className="restaurant-card-content">
        <span className="restaurant-card-label">RESTAURANT</span>
        <h2>{restaurant.name}</h2>
        <p>{theme?.tagline}</p>
      </div>

      <span className="restaurant-card-arrow">→</span>
    </button>
  );
}

export default RestaurantCard;