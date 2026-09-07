import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useChowly } from "../context/ChowlyContext";
import {
  getActiveOrders,
  removeActiveOrder,
  upsertActiveOrder,
} from "../services/activeOrders";
import "../styles/MyOrders.css";

const STATUS_LABELS = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function formatStatus(status) {
  return STATUS_LABELS[status] || status || "—";
}

function formatPrice(amount) {
  return `₦${Number(amount || 0).toLocaleString()}`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Date(dateValue).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getPaymentStatus(order) {
  if (!order) {
    return "UNPAID";
  }

  return (
    order.payment?.status ||
    order.payment_status ||
    "UNPAID"
  );
}

function MyOrders() {
  const navigate = useNavigate();
  const { theme } = useChowly();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const themeStyles = {
    "--restaurant-bg": theme?.background || "#f7efcf",
    "--restaurant-surface": theme?.surface || "#ffffff",
    "--restaurant-primary": theme?.primary || "#3d2929",
    "--restaurant-secondary": theme?.secondary || "#d9a6a6",
    "--restaurant-accent": theme?.accent || "#b96f6f",
    "--restaurant-text": theme?.text || "#2f2f2f",
    "--restaurant-heading-font":
      theme?.fontHeading || "'Playfair Display', serif",
    "--restaurant-body-font":
      theme?.fontBody || "'DM Sans', sans-serif",
  };

  /*
   * Load each saved order from the backend. Saved orders that no
   * longer exist are removed instead of being shown as broken.
   *
   * Status, payment, waiter - everything displayed comes from the
   * GET /orders/:id response. localStorage only remembers WHICH
   * order IDs belong to this customer.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const saved = getActiveOrders();

      if (saved.length === 0) {
        if (!cancelled) {
          setLoading(false);
          setItems([]);
        }
        return;
      }

      const results = await Promise.all(
        saved.map(async (entry) => {
          try {
            const response = await api.get(
              `/orders/${entry.id}`
            );

            const order = response.data?.order || response.data;

            if (!order || !order.id) {
              removeActiveOrder(entry.id);
              return null;
            }

            upsertActiveOrder(order, {
              restaurant_id: entry.restaurant_id,
              restaurant_name:
                entry.restaurant_name ||
                order.restaurant_name,
            });

            return { entry, order };
          } catch (err) {
            if (err.response?.status === 404) {
              removeActiveOrder(entry.id);
              return null;
            }

            return {
              entry,
              order: null,
              loadError:
                err.response?.data?.message ||
                "Unable to load this order.",
            };
          }
        })
      );

      if (!cancelled) {
        setItems(results.filter(Boolean));
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * If every order on this page belongs to the same restaurant,
   * "leaving My Orders" returns to THAT restaurant instead of a
   * generic restaurant chooser.
   */
  const backTarget = useMemo(() => {
    const restaurantIds = [];

    items.forEach(({ entry, order }) => {
      const rid =
        order?.restaurant_id || entry?.restaurant_id;

      if (rid && !restaurantIds.includes(rid)) {
        restaurantIds.push(rid);
      }
    });

    if (restaurantIds.length === 1) {
      const singleEntry = items.find(
        ({ entry }) => entry.restaurant_id === restaurantIds[0]
      );

      return {
        restaurantId: restaurantIds[0],
        restaurantName:
          singleEntry?.order?.restaurant_name ||
          singleEntry?.entry?.restaurant_name ||
          "Restaurant",
      };
    }

    return null;
  }, [items]);

  function handleOpenOrder(orderId) {
    navigate(`/order/${orderId}`);
  }

  function handleRemove(orderId) {
    removeActiveOrder(orderId);
    setItems((current) =>
      current.filter((item) =>
        Number(item.entry.id) !== Number(orderId)
      )
    );
  }

  function handleRefresh() {
    window.location.reload();
  }

  function handleBack() {
    if (backTarget) {
      navigate(`/restaurant/${backTarget.restaurantId}`);
      return;
    }

    navigate("/restaurants");
  }

  return (
    <main
      className="my-orders-page"
      style={{
        background: theme?.background || "#f7efcf",
      }}
    >
      <div
        className="my-orders-inner"
        style={themeStyles}
      >
        <header className="my-orders-header">
          <button
            className="back-button"
            onClick={handleBack}
          >
            {backTarget
              ? `← Back to ${backTarget.restaurantName}`
              : "← Restaurants"}
          </button>

          <div className="chowly-wordmark">
            <span>{theme?.logo || "🍽️"}</span>
            Chowly
          </div>
        </header>

        <div className="my-orders-heading">
          <div className="section-eyebrow">
            CUSTOMER
          </div>

          <h1>My Orders</h1>

          <p>
            Your orders stay here so you can track their status,
            find your waiter, report a problem, or pay once served.
          </p>
        </div>

        {error && (
          <div className="error-state">{error}</div>
        )}

        {loading ? (
          <div className="loading-state">
            Loading your orders...
          </div>
        ) : items.length === 0 ? (
          <div className="my-orders-empty">
            <div className="my-orders-empty-icon">🧾</div>

            <strong>No orders yet</strong>

            <p>
              Once you place an order it will appear here and stay
              available until you have paid.
            </p>

            <button
              className="primary-button"
              onClick={() => navigate("/restaurants")}
            >
              Browse restaurants
            </button>
          </div>
        ) : (
          <div className="my-orders-list">
            {items.map(({ entry, order }) => {
              const status = order
                ? order.status
                : entry.status;

              const paymentStatus = getPaymentStatus(order);

              const estimatedWait = order
                ? order.estimated_wait_minutes
                : entry.estimated_wait_minutes;

              const totalAmount = order
                ? order.total_amount
                : entry.total_amount;

              const restaurantName =
                (order && order.restaurant_name) ||
                entry.restaurant_name ||
                "Restaurant";

              const createdAt =
                (order && order.created_at) ||
                entry.created_at;

              const orderRef = order ? order.id : entry.id;

              /*
               * Waiter comes from the live backend response so it
               * updates as soon as staff assign someone.
               */
              const waiterName =
                (order && order.waiter_name) ||
                (entry && entry.waiter_name);

              return (
                <div
                  key={entry.id}
                  className="my-order-card"
                >
                  <div className="my-order-top">
                    <div className="my-order-ref">
                      <strong>Order #{orderRef}</strong>

                      <span className="my-order-restaurant">
                        {restaurantName}
                      </span>

                      <span className="my-order-time">
                        {formatDate(createdAt)}
                      </span>
                    </div>

                    <div className="my-order-badges">
                      <span
                        className={`my-status-badge my-status-${String(
                          status
                        ).toUpperCase()}`}
                      >
                        {formatStatus(status)}
                      </span>

                      <span
                        className={`my-payment-badge my-payment-${String(
                          paymentStatus
                        ).toUpperCase()}`}
                      >
                        {paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="my-order-details">
                    <div>
                      <span>Estimated wait</span>

                      <strong>
                        {estimatedWait
                          ? `${estimatedWait} min`
                          : "Being calculated"}
                      </strong>
                    </div>

                    <div>
                      <span>Waiter</span>

                      <strong>
                        {waiterName || "Not assigned yet"}
                      </strong>
                    </div>

                    <div>
                      <span>Total</span>

                      <strong>
                        {formatPrice(totalAmount)}
                      </strong>
                    </div>

                    <div>
                      <span>Payment</span>

                      <strong>
                        {paymentStatus === "PAID"
                          ? "Paid"
                          : "Unpaid"}
                      </strong>
                    </div>
                  </div>

                  {order === null && (
                    <div className="error-state">
                      {entry.loadError}
                    </div>
                  )}

                  <div className="my-order-actions">
                    <button
                      className="my-order-track"
                      onClick={() => handleOpenOrder(entry.id)}
                    >
                      Track Order
                    </button>

                    <button
                      className="my-order-remove"
                      onClick={() => handleRemove(entry.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="confirmation-actions">
            <button
              className="secondary-button"
              onClick={handleRefresh}
            >
              ↻ Refresh
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default MyOrders;