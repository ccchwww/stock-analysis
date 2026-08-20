export type NavLink = {
  label: string;
  href: string;
};

// Add new tabs here — NavBar renders whatever is in this list, and each
// entry just needs a matching route folder under app/.
export const NAV_LINKS: NavLink[] = [
  { label: "Strategies", href: "/strategies" },
  { label: "Risk Dashboard", href: "/risk-dashboard" },
  { label: "Model Validation", href: "/validation" },
];
