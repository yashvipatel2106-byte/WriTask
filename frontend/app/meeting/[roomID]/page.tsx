"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MeetingRoom from "@/components/meeting/MeetingRoom";
import { useOrganization } from "@/components/context/organizationContext";
import { resolveMeetingByRoomId } from "@/lib/validation/calendarApi";
import { readStoredOrgId } from "@/lib/orgStorage";

function MeetingPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentOrgId } = useOrganization();
  const roomID = String(params.roomID || "");

  const [orgId, setOrgId] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      const next = `/meeting/${encodeURIComponent(roomID)}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Prefer resolving from the shareable room link alone
        const data = await resolveMeetingByRoomId(roomID);
        if (cancelled) return;
        setOrgId(data.orgId);
        setReady(true);
      } catch (err: any) {
        // Fallback: org from query / context (older links)
        const fromQuery = searchParams.get("org") || "";
        const fallback =
          fromQuery || currentOrgId || readStoredOrgId() || "";
        if (fallback) {
          if (!cancelled) {
            setOrgId(fallback);
            setReady(true);
          }
          return;
        }
        if (!cancelled) {
          setError(err?.message || "Unable to open this meeting link.");
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, currentOrgId, roomID]);

  if (!ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1120",
          color: "#94A3B8",
          zIndex: 80,
        }}
      >
        Opening meeting link…
      </div>
    );
  }

  if (error || !orgId) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#0B1120",
          color: "#F1F5F9",
          zIndex: 80,
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ color: "#CBD5E1", fontSize: 14, maxWidth: 420 }}>
          {error ||
            "Could not open this meeting. Make sure you are logged in and belong to the organization."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/calendar")}
          style={{
            background: "#0891B2",
            color: "#fff",
            borderRadius: 12,
            padding: "8px 16px",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Go to calendar
        </button>
      </div>
    );
  }

  return <MeetingRoom roomId={roomID} orgId={orgId} />;
}

export default function MeetingPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0B1120",
            color: "#94A3B8",
            zIndex: 80,
          }}
        >
          Loading meeting…
        </div>
      }
    >
      <MeetingPageInner />
    </Suspense>
  );
}
