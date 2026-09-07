import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useChowly } from "../context/ChowlyContext";
import { upsertActiveOrder } from "../services/activeOrders";

const STATUS_LABELS = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function OrderConfirmation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { theme } = useChowly();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showComplaint, setShowComplaint] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState("");

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingMessage, setRatingMessage] = useState("");

  async function loadOrder(showLoader = false) {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await api.get(`/orders/${orderId}`);

      /*
       * The backend returns the order directly:
       *
       * response.data = {
       *   id: 33,
       *   restaurant_id: 1,
       *   ...
       * }
       *
       * It does NOT return:
       *
       * response.data.order
       */
      if (!response.data || !response.data.id) {
        throw new Error("Order information was not found.");
      }

      setOrder(response.data);
      setError("");

      /*
       * Keep the customer's "My Orders" list in sync with the
       * latest backend status. Completed/paid orders stay listed
       * as history; active ones stay reachable.
       */
      upsertActiveOrder(response.data);
    } catch (err) {
      console.error("Order loading error:", err);

      if (showLoader) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Unable to load your order."
        );
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  /*
   * Initial order load + live status refresh
   */
  useEffect(() => {
    loadOrder(true);

    const interval = setInterval(() => {
      loadOrder(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [orderId]);

  function formatPrice(amount) {
    return `₦${Number(amount || 0).toLocaleString()}`;
  }

  function getPaymentStatus() {
    return order?.payment?.status || order?.payment_status || "UNPAID";
  }

  function isPaid() {
    return String(getPaymentStatus()).toUpperCase() === "PAID";
  }

  function canPay() {
    return order?.status === "SERVED" && !isPaid();
  }

  function canRate() {
    return isPaid();
  }

  function canComplain() {
    return (
      order &&
      !["COMPLETED", "CANCELLED"].includes(order.status)
    );
  }

  async function submitComplaint() {
    if (!complaint.trim()) {
      setComplaintMessage("Please describe your complaint.");
      return;
    }

    try {
      setSubmittingComplaint(true);
      setComplaintMessage("");

      await api.post(`/orders/${order.id}/complaints`, {
        complaint: complaint.trim(),
        message: complaint.trim(),
      });

      setComplaint("");
      setShowComplaint(false);

      setComplaintMessage(
        "Your complaint has been sent to the restaurant."
      );

      await loadOrder(false);
    } catch (err) {
      console.error("Complaint submission error:", err);

      setComplaintMessage(
        err.response?.data?.message ||
          "Unable to submit your complaint."
      );
    } finally {
      setSubmittingComplaint(false);
    }
  }

  async function submitPayment() {
    try {
      setSubmittingPayment(true);
      setPaymentMessage("");

      await api.post(`/orders/${order.id}/payment`, {
        payment_method: paymentMethod,
      });

      setPaymentMessage("Payment recorded successfully.");
      setShowPayment(false);

      /*
       * Reloads the order (status COMPLETED, payment PAID) so
       * the tracking page and the stored "My Orders" entry stay
       * in sync.
       */
      await loadOrder(false);
    } catch (err) {
      console.error("Payment submission error:", err);

      setPaymentMessage(
        err.response?.data?.message ||
          "Unable to record payment."
      );
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function submitRating() {
    if (!rating) {
      setRatingMessage("Please select a rating.");
      return;
    }

    try {
      setSubmittingRating(true);
      setRatingMessage("");

      await api.post(`/orders/${order.id}/rating`, {
        rating,
        feedback: feedback.trim(),
      });

      setRatingMessage("Thank you for your feedback.");

      await loadOrder(false);
    } catch (err) {
      console.error("Rating submission error:", err);

      setRatingMessage(
        err.response?.data?.message ||
          "Unable to submit your rating."
      );
    } finally {
      setSubmittingRating(false);
    }
  }

  if (loading) {
    return (
      <main
        className={`restaurant-page ${
          theme?.style ? `restaurant-${theme.style}` : ""
        }`}
      >
        <div className="order-confirmation-page">
          <div className="loading-state">
            Loading your order...
          </div>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main
        className={`restaurant-page ${
          theme?.style ? `restaurant-${theme.style}` : ""
        }`}
      >
        <div className="order-confirmation-page">
          <div className="error-state">
            <strong>We couldn't find that order.</strong>

            <p>
              {error || "The order information is unavailable."}
            </p>

            <button
              className="primary-button"
              onClick={() => navigate("/my-orders")}
            >
              Back to My Orders
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`restaurant-page ${
        theme?.style ? `restaurant-${theme.style}` : ""
      }`}
    >
      <div className="order-confirmation-page">
        <div className="order-success-icon">✓</div>

        <div className="section-eyebrow">
          ORDER RECEIVED
        </div>

        <h1>Your order is on its way.</h1>

        <p className="order-confirmation-subtitle">
          The restaurant has received your order and will prepare it
          shortly.
        </p>

        <div className="order-confirmation-card">
          <div className="confirmation-top">
            <div>
              <span>ORDER</span>

              <strong>#{order.id}</strong>
            </div>

            <div className="order-status-badge">
              {STATUS_LABELS[order.status] || order.status}
            </div>
          </div>

          <div className="confirmation-restaurant">
            <span>{theme?.logo || "🍽️"}</span>

            <div>
              <strong>{order.restaurant_name}</strong>

              <small>
                Your order is being handled by the restaurant.
              </small>
            </div>
          </div>

          <div className="confirmation-payment">
            <div>
              <span>NAME</span>

              <strong>{order.customer_name || "—"}</strong>
            </div>

            <div>
              <span>PHONE</span>

              <strong>{order.customer_phone || "—"}</strong>
            </div>

            <div>
              <span>TABLE</span>

              <strong>{order.table_number || "—"}</strong>
            </div>
          </div>

          {order.special_request && (
            <div className="confirmation-payment">
              <div>
                <span>SPECIAL REQUEST / NOTE</span>

                <strong>{order.special_request}</strong>
              </div>
            </div>
          )}

          {/*
           * SERVING WAITER
           *
           * Comes straight from the backend order response. When
           * staff have not assigned a waiter yet the text falls
           * back to "Not assigned yet" (never a hardcoded name).
           * Polling every 10 seconds refreshes this, so the
           * customer sees the waiter as soon as staff assign one.
           */}
          <div className="confirmation-wait">
            <span className="confirmation-wait-icon">
              👤
            </span>

            <div>
              <small>YOUR WAITER THIS TIME</small>

              <strong>
                {order.waiter_name
                  ? `Waiter: ${order.waiter_name}`
                  : "Waiter: Not assigned yet"}
              </strong>
            </div>
          </div>

          {/*
           * ORDER ITEMS
           *
           * Each line shows the item quantity and name.
           * Individual item prices are intentionally NOT shown
           * here. Order options (flavour, toppings, soup,
           * protein, dip, swallow) are rendered as tags
           * underneath. The final row is the grand total.
           */}
          {order.items?.length > 0 ? (
            <div className="confirmation-items">
              <div className="confirmation-items-heading">
                <span>YOUR ORDER</span>
              </div>

              {order.items.map((item) => (
                <div
                  key={item.order_item_id || item.id}
                  className="confirmation-item"
                >
                  <div className="confirmation-item-main">
                    <strong>
                      {item.quantity}×{" "}
                      {item.menu_item_name || item.name}
                    </strong>

                    {item.options?.length > 0 && (
                      <div className="confirmation-item-options">
                        {item.options.map((option) => (
                          <span
                            key={
                              option.option_id ||
                              option.id
                            }
                          >
                            {option.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="confirmation-item confirmation-item-total">
                <span>ORDER TOTAL</span>

                <strong>
                  {formatPrice(order.total_amount)}
                </strong>
              </div>
            </div>
          ) : (
            <div className="confirmation-total">
              <span>Total</span>

              <strong>
                {formatPrice(order.total_amount)}
              </strong>
            </div>
          )}

          <div className="confirmation-wait">
            <span className="confirmation-wait-icon">
              ⏱
            </span>

            <div>
              <small>ESTIMATED WAIT</small>

              <strong>
                {order.estimated_wait_minutes
                  ? `${order.estimated_wait_minutes} minutes`
                  : "Being calculated"}
              </strong>
            </div>
          </div>

          <div className="confirmation-payment">
            <div>
              <span>PAYMENT</span>

              <strong>
                {isPaid() ? "PAID" : "UNPAID"}
              </strong>
            </div>

            <div>
              <span>WHEN</span>

              <strong>
                {isPaid()
                  ? "Payment received"
                  : "After your meal"}
              </strong>
            </div>
          </div>

          {paymentMessage && (
            <div className="pretend-payment-notice">
              <strong>{paymentMessage}</strong>
            </div>
          )}

          {canPay() && (
            <div className="pretend-payment-notice">
              <strong>Your order has been served.</strong>

              <span>
                You can now pay for your meal.
              </span>

              <button
                className="primary-button"
                onClick={() => setShowPayment(true)}
              >
                Pay Now
              </button>
            </div>
          )}

          {showPayment && canPay() && (
            <div className="confirmation-payment">
              <div>
                <span>PAYMENT METHOD</span>

                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Transfer">Transfer</option>
                </select>
              </div>

              <button
                className="primary-button confirm-payment-button"
                onClick={submitPayment}
                disabled={submittingPayment}
              >
                {submittingPayment
                  ? "RECORDING PAYMENT..."
                  : "Confirm payment"}
              </button>

              <button
                className="secondary-button"
                onClick={() => setShowPayment(false)}
                disabled={submittingPayment}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {canComplain() && (
          <div className="confirmation-actions">
            {!showComplaint ? (
              <button
                className="secondary-button"
                onClick={() => setShowComplaint(true)}
              >
                Report a Problem
              </button>
            ) : (
              <div className="confirmation-payment">
                <strong>
                  Tell the restaurant what's wrong
                </strong>

                <textarea
                  value={complaint}
                  onChange={(event) =>
                    setComplaint(event.target.value)
                  }
                  placeholder="Describe the delay or problem with your order..."
                  rows={4}
                />

                <button
                  className="primary-button"
                  onClick={submitComplaint}
                  disabled={submittingComplaint}
                >
                  {submittingComplaint
                    ? "SENDING..."
                    : "Submit complaint"}
                </button>

                <button
                  className="secondary-button"
                  onClick={() => {
                    setShowComplaint(false);
                    setComplaintMessage("");
                  }}
                  disabled={submittingComplaint}
                >
                  Cancel
                </button>

                {complaintMessage && (
                  <small>{complaintMessage}</small>
                )}
              </div>
            )}
          </div>
        )}

        {canRate() && (
          <div className="order-confirmation-card">
            <div className="section-eyebrow">
              YOUR FEEDBACK
            </div>

            <h2>How was your meal?</h2>

            <div className="confirmation-payment">
              <div>
                <span>RATING</span>

                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="rating-star-button"
                      onClick={() => setRating(value)}
                      aria-label={`${value} star rating`}
                      style={{
                        fontSize: "1.8rem",
                        border: "0",
                        background: "transparent",
                        cursor: "pointer",
                        padding: "0",
                        lineHeight: 1,
                        opacity:
                          value <= rating ? 1 : 0.35,
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span>FOOD FEEDBACK</span>

                <textarea
                  value={feedback}
                  onChange={(event) =>
                    setFeedback(event.target.value)
                  }
                  placeholder="Tell us what you thought about the food..."
                  rows={4}
                />
              </div>

              <button
                className="primary-button"
                onClick={submitRating}
                disabled={submittingRating}
              >
                {submittingRating
                  ? "SUBMITTING..."
                  : "Submit feedback"}
              </button>

              {ratingMessage && (
                <small>{ratingMessage}</small>
              )}
            </div>
          </div>
        )}

        <div className="confirmation-actions">
          <button
            className="primary-button"
            onClick={() => navigate("/my-orders")}
          >
            My Orders
            <span>→</span>
          </button>

          {/*
           * Leaving tracking returns to THIS order's restaurant
           * (identified by the backend restaurant_id), not to a
           * generic restaurant chooser.
           */}
          <button
            className="secondary-button"
            onClick={() =>
              navigate(`/restaurant/${order.restaurant_id}`)
            }
          >
            Back to {order.restaurant_name || "Restaurant"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default OrderConfirmation;