import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { authFetch } from "@/lib/validation/authFetch";
import {
  clearStoredProjectId,
  readStoredOrgId,
  writeStoredOrgId,
} from "@/lib/orgStorage";
import type { RootState } from "@/store";
import type { OrgAccessData, OrgState } from "@/store/types/org";

function resolveOrgIdFromAccess(
  access: OrgAccessData,
  preferredId: string | null
): string | null {
  if (
    preferredId &&
    access.organizations.some((org) => org.organizationId === preferredId)
  ) {
    return preferredId;
  }

  if (access.organizations.length > 0) {
    return access.organizations[0].organizationId;
  }

  return null;
}

export const fetchOrgAccess = createAsyncThunk(
  "org/fetchAccess",
  async (_, { rejectWithValue }) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      return rejectWithValue("NO_TOKEN");
    }

    const res = await authFetch("/organizations/me/access");
    if (!res.ok) {
      return rejectWithValue("FETCH_FAILED");
    }

    return (await res.json()) as OrgAccessData;
  },
  {
    condition: (_, { getState }) => {
      const { accessStatus } = (getState() as RootState).org;
      return accessStatus !== "pending";
    },
  }
);

export function createInitialOrgState(): OrgState {
  return {
    currentOrgId: readStoredOrgId(),
    access: null,
    loading: false,
    accessStatus: "idle",
  };
}

const orgSlice = createSlice({
  name: "org",
  initialState: createInitialOrgState(),
  reducers: {
    setCurrentOrgId(state, action: PayloadAction<string | null>) {
      if (state.currentOrgId !== action.payload) {
        clearStoredProjectId();
      }
      state.currentOrgId = action.payload;
      writeStoredOrgId(action.payload);
    },
    clearOrgState() {
      writeStoredOrgId(null);
      clearStoredProjectId();
      return {
        currentOrgId: null,
        access: null,
        loading: false,
        accessStatus: "idle" as const,
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrgAccess.pending, (state) => {
        state.accessStatus = "pending";
        if (!state.access) {
          state.loading = true;
        }
      })
      .addCase(fetchOrgAccess.fulfilled, (state, action) => {
        state.access = action.payload;
        const resolved = resolveOrgIdFromAccess(
          action.payload,
          state.currentOrgId ?? readStoredOrgId()
        );
        if (resolved !== state.currentOrgId) {
          clearStoredProjectId();
        }
        state.currentOrgId = resolved;
        writeStoredOrgId(resolved);
        state.loading = false;
        state.accessStatus = "succeeded";
      })
      .addCase(fetchOrgAccess.rejected, (state, action) => {
        if (action.payload === "NO_TOKEN") {
          state.access = null;
          state.currentOrgId = null;
          writeStoredOrgId(null);
        }
        state.loading = false;
        state.accessStatus = "failed";
      });
  },
});

export const { setCurrentOrgId, clearOrgState } = orgSlice.actions;
export default orgSlice.reducer;
