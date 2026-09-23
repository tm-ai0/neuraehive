import { defineConfig } from "vite";

// Deployed at nh.thomasmaury.fr/pulse/, not the domain root — without this,
// built asset URLs would be absolute from "/" and 404 once served from the
// subpath.
export default defineConfig({
  base: "/pulse/",
});
