import { ImagePlus, Send, SmilePlus, Video, Phone } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { GlobalBackButton } from "@/components/global-back-button";

type ChatOpeningShellProps = {
  name?: string;
  username?: string;
  avatar?: string | null;
  status?: string;
};

export function ChatOpeningShell({
  name = "Opening chat",
  username,
  avatar,
  status = "loading...",
}: ChatOpeningShellProps) {
  return (
    <div className="chat-screen chat-opening-shell" aria-live="polite" aria-busy="true">
      <header className="chat-header">
        <GlobalBackButton variant="inline" />
        <Avatar name={name} src={avatar} size={42} />
        <div className="chat-person">
          <strong>{name}</strong>
          <span>{status}</span>
        </div>
        <button className="icon-button" type="button" title="Audio call" disabled><Phone size={19} /></button>
        <button className="icon-button" type="button" title="Video call" disabled><Video size={19} /></button>
      </header>

      <div className="message-list">
        <div className="conversation-intro">
          <Avatar name={name} src={avatar} size={72} />
          <strong>{name}</strong>
          {username && <span>@{username}</span>}
        </div>
        <div className="message-row theirs">
          <div className="message-bubble chat-opening-bubble" />
        </div>
        <div className="message-row mine">
          <div className="message-bubble chat-opening-bubble short" />
        </div>
      </div>

      <div className="chat-compose-wrap">
        <form className="message-composer">
          <button type="button" className="icon-button" title="Add media" disabled><ImagePlus size={20} /></button>
          <button type="button" className="icon-button" title="Emoji" disabled><SmilePlus size={20} /></button>
          <textarea placeholder="Write a message" rows={1} disabled />
          <button type="button" className="send-button" title="Send" disabled><Send size={19} /></button>
        </form>
      </div>
    </div>
  );
}
