import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Download, LockKeyhole, MessageCircle, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Kizo | Private Adult Chat",
  description: "A private 18+ chat and calling platform for verified hosts and respectful adult conversations.",
};

const hostAppDownload = "/downloads/wetdreams-host-app.apk";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/landing" className="landing-logo" aria-label="Kizo landing page">
          <span>
            <Image src="/brand/kizo-logo.png" alt="" fill sizes="36px" priority />
          </span>
          Kizo
        </Link>
        <nav aria-label="Landing navigation">
          <Link href="/discover">Explore</Link>
          <Link href="/login">Login</Link>
          <a href={hostAppDownload} download>Host App</a>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker"><ShieldCheck size={16} /> Adults only, respectful by design</span>
          <h1>Private adult chat with verified hosts.</h1>
          <p>
            Kizo is built for safe, paid conversations, live calls, and real-time connection without public explicit content.
          </p>
          <div className="landing-actions">
            <Link className="button primary large" href="/discover">
              <Sparkles size={20} /> Start chatting
            </Link>
            <a className="button secondary large" href={hostAppDownload} download>
              <Download size={20} /> Download Host App
            </a>
          </div>
          <div className="landing-trust-row">
            <span><BadgeCheck size={16} /> Host approval</span>
            <span><LockKeyhole size={16} /> Private wallet</span>
            <span><ShieldCheck size={16} /> 18+ only</span>
          </div>
        </div>

        <div className="landing-phone" aria-label="Kizo app preview">
          <div className="landing-phone-top">
            <span />
            <strong>Kizo</strong>
            <span />
          </div>
          <div className="landing-card-preview">
            <div className="landing-avatar-ring">
              <Image src="/brand/kizo-logo.png" alt="" fill sizes="96px" priority />
            </div>
            <h2>Neelam</h2>
            <p>Online now</p>
            <div className="landing-preview-actions">
              <span><MessageCircle size={18} /> Message</span>
              <span><PhoneCall size={18} /> Call</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band" aria-label="Host app download">
        <div>
          <span className="landing-kicker">Host App</span>
          <h2>For approved hosts on Android</h2>
          <p>Receive calls, reply to chats, and manage your host experience from the Kizo Host App.</p>
        </div>
        <a className="button primary large" href={hostAppDownload} download>
          <Download size={20} /> Download APK
        </a>
      </section>

      <section className="landing-features">
        <article>
          <MessageCircle size={24} />
          <h2>Real-time chat</h2>
          <p>Quick conversations with delivery states, unread badges, and disappearing chat media.</p>
        </article>
        <article>
          <PhoneCall size={24} />
          <h2>Voice and video calls</h2>
          <p>Mobile-first calling with clear controls, coin billing, and host availability states.</p>
        </article>
        <article>
          <ShieldCheck size={24} />
          <h2>Safer host discovery</h2>
          <p>Discovery is limited to approved hosts, with blocking, reporting, and moderation controls.</p>
        </article>
      </section>

      <footer className="landing-footer">
        <span>Kizo is for adults 18+ only.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/safety">Safety</Link>
          <Link href="/host-policy">Host Policy</Link>
        </div>
      </footer>
    </main>
  );
}
