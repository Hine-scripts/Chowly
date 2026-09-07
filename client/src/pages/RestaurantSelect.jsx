import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import RestaurantCard from "../components/RestaurantCard";

function RestaurantSelect() {
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRestaurants() {
      try {
        const response = await api.get("/restaurants");
        setRestaurants(response.data.restaurants || []);
      } catch (err) {
        console.error(err);
        setError("We couldn't load the restaurants.");
      } finally {
        setLoading(false);
      }
    }

    loadRestaurants();
  }, []);

  return (
    <main className="selection-page">
      <header className="selection-header">
        <button
          className="back-button"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>

        <div className="chowly-wordmark">
          <span>🍽️</span>
          Chowly
        </div>
      </header>

      <section className="selection-content">
        <div className="section-eyebrow">CHOOSE YOUR RESTAURANT</div>

        <h1>Where are we eating?</h1>

        <p>
          Pick a restaurant to explore its menu and place your order.
        </p>

        {loading && (
          <div className="loading-state">
            Loading restaurants...
          </div>
        )}

        {error && (
          <div className="error-state">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="restaurant-list">
            {restaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default RestaurantSelect;