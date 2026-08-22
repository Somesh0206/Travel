import { api } from "@/lib/api";

/**
 * Analytics tracking service for commuter feature utilization.
 * Operates non-blockingly so user workflows remain instantaneous.
 */
export async function trackFeature(featureName, featureCategory = "General", actionDetails = "", platform = "Web") {
  try {
    const gid = localStorage.getItem("mova_guest_id");
    const headers = gid ? {
      "X-Guest-ID": gid,
      "X-Guest-Name": `Guest Commuter (${gid.replace("guest_", "")})`
    } : {};

    await api.post("/analytics/track", {
      feature_name: featureName,
      feature_category: featureCategory,
      action_details: actionDetails || `Used ${featureName}`,
      platform: platform || (window.innerWidth < 768 ? "Mobile" : "Web / Desktop")
    }, { headers });
  } catch (err) {
    // Non-fatal background analytics error
    console.debug("Analytics track skipped:", err?.message);
  }
}
