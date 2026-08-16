import { BrandedLoader } from "@/components/branded-loader";

type ChatOpeningShellProps = {
  name?: string;
  username?: string;
  avatar?: string | null;
  status?: string;
};

export function ChatOpeningShell({
  name = "Opening chat",
}: ChatOpeningShellProps) {
  return <BrandedLoader label={name === "Opening chat" ? "Opening chat" : `Opening ${name}`} />;
}
