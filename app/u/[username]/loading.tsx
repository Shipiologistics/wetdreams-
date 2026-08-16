import { BrandedLoader } from "@/components/branded-loader";
import { Logo } from "@/components/logo";

export default function PublicProfileLoading() {
  return (
    <main className="public-profile-loading">
      <div className="public-profile-loading-top">
        <Logo />
      </div>
      <BrandedLoader label="Opening profile" />
    </main>
  );
}
