import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <div className="landing-decoration decoration-one"></div>
      <div className="landing-decoration decoration-two"></div>

      <section className="landing-content">
        <div className="brand-badge">
          <span>🍽️</span>
          Chowly
        </div>

        <h1>
          Your table.
          <br />
          <span>Your order.</span>
          <br />
          Your way.
        </h1>

        <p className="landing-description">
          A smarter way to order, track and enjoy your meal.
          Choose a restaurant and let Chowly handle the rest.
        </p>

        <button
          className="primary-button landing-button"
          onClick={() => navigate("/restaurants")}
        >
          Explore restaurants
          <span>→</span>
        </button>

        <p className="landing-footer">
          One platform. Different restaurants. Better ordering.
        </p>
      </section>
    </main>
  );
}

export default Home;