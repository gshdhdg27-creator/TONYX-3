import ProfilePage from "@/pages/profile";
import { ProfileTasksButton } from "@/components/ProfileTasksButton";

/**
 * Profile shell: Tasks button under global Header, then profile content.
 */
export default function ProfileWithTasksPage() {
  return (
    <div style={{ position: "relative", paddingTop: 8 }}>
      <div style={{ padding: "48px 16px 0" }}>
        <ProfileTasksButton />
      </div>
      {/* ProfilePage has its own top padding for Header — slightly reduced feel via negative margin */}
      <div style={{ marginTop: -40 }}>
        <ProfilePage />
      </div>
    </div>
  );
}
