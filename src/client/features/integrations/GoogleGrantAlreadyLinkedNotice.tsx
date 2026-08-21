export function GoogleGrantAlreadyLinkedNotice({
  integrationName,
  onRelease,
  releasing,
}: {
  integrationName: string;
  onRelease: () => void;
  releasing: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5">
      <p className="text-sm text-base-content/80">
        This Google account is already linked to a different OpenSEO user.
        Disconnect that {integrationName} grant by signing in with the same
        Google account, then connect again.
      </p>
      <button
        type="button"
        className="btn btn-outline btn-sm border-base-300"
        onClick={onRelease}
        disabled={releasing}
      >
        {releasing ? "Redirecting…" : `Disconnect ${integrationName} grant`}
      </button>
    </div>
  );
}
