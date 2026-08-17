import type { Database } from "@/lib/database.types";

export type Account = Database["public"]["Tables"]["users"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileMedia = Database["public"]["Tables"]["profile_media"]["Row"];
export type HostRequest = Database["public"]["Tables"]["host_requests"]["Row"];
export type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type ChatRoom = Database["public"]["Tables"]["chat_rooms"]["Row"];

export type DiscoveryProfile = {
  account: Account;
  profile: Profile;
  media: ProfileMedia[];
  rating: number | null;
  favorite: boolean;
};
