import { createContext, useContext, useMemo, useState } from "react";

const ChowlyContext = createContext();

const restaurantThemes = {
  1: {
    id: 1,
    name: "Chowly Kitchen",
    tagline: "Good food. Good mood.",
    logo: "🍴",
    background: "#F8E4E4",
    surface: "#FFF9F8",
    primary: "#7A4545",
    secondary: "#D9A6A6",
    accent: "#B96F6F",
    text: "#3D2929",
    fontHeading: "'Playfair Display', serif",
    fontBody: "'DM Sans', sans-serif",
    style: "cozy",
  },

  2: {
    id: 2,
    name: "Harlow Creamery",
    tagline: "A little scoop of happiness.",
    logo: "🍦",

    // More distinctly pastel
    background: "#EDE7F8",
    surface: "#FFFCFF",
    primary: "#8B78B8",
    secondary: "#D8CDEE",
    accent: "#A9C9D8",
    text: "#40384D",

    fontHeading: "'Fredoka', sans-serif",
    fontBody: "'Nunito', sans-serif",

    style: "playful",
  },

  3: {
    id: 3,
    name: "Lagos Bistro",
    tagline: "Good food. Great vibes. Lagos.",
    logo: "🍢",
    background: "#E8EFE2",
    surface: "#F8FAF4",
    primary: "#536B43",
    secondary: "#B5C3A4",
    accent: "#8A5A3B",
    text: "#2F3528",
    fontHeading: "'Manrope', sans-serif",
    fontBody: "'Manrope', sans-serif",
    style: "earthy",
  },
};
export function ChowlyProvider({ children }) {
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [role, setRole] = useState("CUSTOMER");

  const theme = useMemo(() => {
    if (!selectedRestaurant) return null;

    return restaurantThemes[selectedRestaurant.id] || null;
  }, [selectedRestaurant]);

  return (
    <ChowlyContext.Provider
      value={{
        selectedRestaurant,
        setSelectedRestaurant,
        role,
        setRole,
        theme,
        restaurantThemes,
      }}
    >
      {children}
    </ChowlyContext.Provider>
  );
}

export function useChowly() {
  return useContext(ChowlyContext);
}