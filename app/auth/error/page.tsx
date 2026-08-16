import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function AuthErrorPage() {
  return (
    <main className="center-page">
      <CircleAlert size={34} />
      <h1>That sign-in link did not work</h1>
      <p>It may have expired or already been used.</p>
      <Link href="/login" className="button primary">Return to sign in</Link>
    </main>
  );
}
