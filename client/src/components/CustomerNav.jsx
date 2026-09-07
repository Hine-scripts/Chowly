import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useChowly } from "../context/ChowlyContext";
import {
  getActiveOrders,
  subscribeChowlyOrders,
} from "../services/activeOrders";
import "../styles/CustomerNav.css";

/*
 * Persistent customer-side navigation entry point.
 *
 * Rendered once at the app root so it stays available on every
 * customer page. It hides itself for staff roles so the
 * customer and staff experiences stay separate.
 */
export default function CustomerNav() {
  const { role } = useChowly();

  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () =>
      setCount(getActiveOrders().length);

    refresh();

    return subscribeChowlyOrders(refresh);
  }, []);

  if (role !== "CUSTOMER") {
    return null;
  }

  return (
    <Link
      to="/my-orders"
      className="customer-orders-nav"
      aria-label="My Orders"
    >
      <span className="customer-orders-icon">
        🧾
      </span>

      <span className="customer-orders-label">
        My Orders
      </span>

      {count > 0 && (
        <span className="customer-orders-count">
          {count}
        </span>
      )}
    </Link>
  );
}