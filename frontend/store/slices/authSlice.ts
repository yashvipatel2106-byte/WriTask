import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  normalizeUserProfile,
  persistUserProfile,
  readHydratedUser,
} from "@/lib/authUser";
import { authFetch } from "@/lib/validation/authFetch";
import type { RootState } from "@/store";
import type { AuthState, UserProfile } from "@/store/types/auth";

type FetchProfileArg = { force?: boolean } | undefined;

export const fetchUserProfile = createAsyncThunk<
  UserProfile,
  FetchProfileArg,
  { rejectValue: string }
>(
  "auth/fetchProfile",
  async (_, { rejectWithValue }) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      return rejectWithValue("NO_TOKEN");
    }

    const res = await authFetch("/profile");
    if (!res.ok) {
      return rejectWithValue("FETCH_FAILED");
    }

    const data = await res.json();
    return normalizeUserProfile(data);
  },
  {
    condition: (arg, { getState }) => {
      const auth = (getState() as RootState).auth;
      if (arg?.force) return true;
      return auth.fetchStatus !== "pending";
    },
  }
);

export const updateUserProfile = createAsyncThunk(
  "auth/updateProfile",
  async (payload: Record<string, string>, { rejectWithValue }) => {
    const res = await authFetch("/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return rejectWithValue(
        (data as { message?: string }).message || "UPDATE_FAILED"
      );
    }

    const data = await res.json();
    return normalizeUserProfile(data);
  }
);

export function createInitialAuthState(): AuthState {
  return {
    user: readHydratedUser(),
    loading: false,
    fetchStatus: "idle",
    updateStatus: "idle",
    profileError: null,
  };
}

function applyUser(state: AuthState, user: UserProfile) {
  state.user = user;
  persistUserProfile(user);
}

const authSlice = createSlice({
  name: "auth",
  initialState: createInitialAuthState(),
  reducers: {
    setUserFromLogin(state, action: PayloadAction<UserProfile>) {
      applyUser(state, action.payload);
      state.fetchStatus = "succeeded";
      state.updateStatus = "idle";
      state.profileError = null;
    },
    patchUserProfile(state, action: PayloadAction<Partial<UserProfile>>) {
      if (!state.user) return;
      applyUser(state, { ...state.user, ...action.payload });
    },
    clearUserState() {
      return createInitialAuthState();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.fetchStatus = "pending";
        state.profileError = null;
        if (!state.user) {
          state.loading = true;
        }
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        applyUser(state, action.payload);
        state.loading = false;
        state.fetchStatus = "succeeded";
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.fetchStatus = "failed";
        state.profileError =
          (action.payload as string) || action.error.message || "Unknown error";
        if (action.payload === "NO_TOKEN") {
          state.user = null;
        }
      })
      .addCase(updateUserProfile.pending, (state, action) => {
        state.updateStatus = "pending";
        state.profileError = null;
        if (state.user) {
          const patch = action.meta.arg;
          state.user = {
            ...state.user,
            ...patch,
            username: patch.username?.trim() || state.user.username,
          };
          persistUserProfile(state.user);
        }
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        applyUser(state, action.payload);
        state.loading = false;
        state.updateStatus = "succeeded";
        state.fetchStatus = "succeeded";
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.updateStatus = "failed";
        state.profileError =
          (action.payload as string) || action.error.message || "Update failed";
      });
  },
});

export const { setUserFromLogin, patchUserProfile, clearUserState } =
  authSlice.actions;
export default authSlice.reducer;
