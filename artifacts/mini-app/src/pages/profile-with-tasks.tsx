import ProfilePage from "@/pages/profile";
import { ProfileTasksButton } from "@/components/ProfileTasksButton";

/**
 * Profile shell: inserts a Portals-style Tasks button above the existing profile UI.
 * (Keeps profile.tsx untouched to avoid a huge rewrite.)
 */
export default function ProfileWithTasksPage() {
  return (
    <div style={{ position: "relative" }}>
      {/* Floating Tasks entry — sits under header, above profile content */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          padding: "8px 16px 0",
          background: "linear-gradient(180deg, hsl(240 16% 4%) 60%, transparent)",
        }}
      >
        <ProfileTasksButton />
      </div>
      <ProfilePage />
    </div>
  );
}
