export type UserProfileMeta = {
  isOrgOwner?: boolean;
  isOrgMember?: boolean;
  designationLocked?: boolean;
  departmentLocked?: boolean;
};

export type UserProfile = {
  _id: string;
  username: string;
  email: string;
  phone?: string;
  designation?: string;
  department?: string;
  location?: string;
  bio?: string;
  avatarColor?: string; 
  systemRole?: string;
  profileMeta?: UserProfileMeta;
};

export type ProfileRequestStatus = "idle" | "pending" | "succeeded" | "failed";

export type AuthState = {
  user: UserProfile | null;
  loading: boolean;
  fetchStatus: ProfileRequestStatus;
  updateStatus: ProfileRequestStatus;
  profileError: string | null;
};
