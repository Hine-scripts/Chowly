import { useLocation, useNavigate } from "react-router-dom";
import { useChowly } from "../context/ChowlyContext";

const STAFF_ROLES = [
  {
    value: "WAITER",
    label: "Waiter",
  },
  {
    value: "CHEF",
    label: "Chef",
  },
  {
    value: "BARTENDER",
    label: "Bartender",
  },
  {
    value: "ADMIN",
    label: "Admin",
  },
];

export default function RoleSwitcher() {
  const { role, setRole, selectedRestaurant } = useChowly();
  const location = useLocation();
  const navigate = useNavigate();

  const isStaffSection = location.pathname.includes("/staff");

  function isStaffRole(value) {
    return STAFF_ROLES.some((staffRole) => staffRole.value === value);
  }

  function handleRoleChange(nextRole) {
    const restaurantId = selectedRestaurant?.id;

    /*
     * Customer role returns to the customer menu.
     */
    if (nextRole === "CUSTOMER") {
      setRole("CUSTOMER");

      if (restaurantId) {
        navigate(`/restaurant/${restaurantId}`);
      } else {
        navigate("/restaurants");
      }

      return;
    }

    /*
     * The generic "Staff" button maps to the Waiter dashboard so
     * that the segmented control always highlights a real role.
     */
    const staffRole = nextRole === "STAFF" ? "WAITER" : nextRole;

    if (staffRole !== "STAFF" && isStaffRole(staffRole)) {
      setRole(staffRole);

      if (!isStaffSection) {
        if (restaurantId) {
          navigate(`/restaurant/${restaurantId}/staff`);
        } else {
          navigate("/restaurants");
        }
      }
    }
  }

  /*
   * CUSTOMER SIDE
   *
   * Customer / Staff
   */
  if (!isStaffSection) {
    return (
      <div className="role-switcher">
        <button
          type="button"
          className={role === "CUSTOMER" ? "active" : ""}
          onClick={() => handleRoleChange("CUSTOMER")}
        >
          Customer
        </button>

        <button
          type="button"
          className={
            role === "STAFF" || isStaffRole(role) ? "active" : ""
          }
          onClick={() => handleRoleChange("STAFF")}
        >
          Staff
        </button>
      </div>
    );
  }

  /*
   * STAFF SIDE
   *
   * Customer is included here so staff can
   * return directly to the customer experience.
   */
  return (
    <div className="role-switcher">
      <button
        type="button"
        className={role === "CUSTOMER" ? "active" : ""}
        onClick={() => handleRoleChange("CUSTOMER")}
      >
        Customer
      </button>

      {STAFF_ROLES.map((staffRole) => (
        <button
          key={staffRole.value}
          type="button"
          className={role === staffRole.value ? "active" : ""}
          onClick={() => handleRoleChange(staffRole.value)}
        >
          {staffRole.label}
        </button>
      ))}
    </div>
  );
}