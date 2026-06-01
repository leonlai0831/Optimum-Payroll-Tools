import { BrandedLoader } from "@/components/branded-loader";

// Root loading boundary for the protected app. Without this, navigating to a
// top-level route (Home, or anything without its own loading.tsx) showed no
// instant feedback — the click appeared to "hang" until the server component
// finished. The persistent top Nav lives in the layout and stays put; this just
// fills the page area with the branded loader the moment navigation starts.
export default function Loading() {
  return <BrandedLoader />;
}
