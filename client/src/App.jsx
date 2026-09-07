import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ChowlyProvider } from "./context/ChowlyContext";

import Home from "./pages/Home";
import RestaurantSelect from "./pages/RestaurantSelect";
import Restaurant from "./pages/Restaurant";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import MyOrders from "./pages/MyOrders";
import StaffDashboard from "./pages/StaffDashboard";

import CustomerNav from "./components/CustomerNav";

function App() {
  return (
    <ChowlyProvider>
      <BrowserRouter>
        {/* Persistent customer-side "My Orders" entry point. */}
        <CustomerNav />

        <Routes>
          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/restaurants"
            element={<RestaurantSelect />}
          />

          <Route
            path="/restaurant/:id"
            element={<Restaurant />}
          />

          <Route
            path="/restaurant/:id/checkout"
            element={<Checkout />}
          />

          <Route
            path="/restaurant/:id/staff"
            element={<StaffDashboard />}
          />

          <Route
            path="/my-orders"
            element={<MyOrders />}
          />

          <Route
            path="/order/:orderId"
            element={<OrderConfirmation />}
          />
        </Routes>
      </BrowserRouter>
    </ChowlyProvider>
  );
}

export default App;