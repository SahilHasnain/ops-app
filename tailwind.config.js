/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        panel: "#161b22",
        raised: "#1c2128",
        line: "#30363d",
        copy: "#e6edf3",
        dim: "#8b949e",
        brand: "#2f81f7",
        success: "#3fb950",
        warning: "#d29922",
        danger: "#f85149",
      },
    },
  },
  plugins: [],
};
