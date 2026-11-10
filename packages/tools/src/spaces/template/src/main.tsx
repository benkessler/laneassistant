import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

// biome-ignore lint/style/noNonNullAssertion: root element guaranteed by index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConvexProvider client={convex}>
			<App />
		</ConvexProvider>
	</StrictMode>,
);
