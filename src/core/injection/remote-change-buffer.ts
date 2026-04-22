import type { UserStoreChange } from "../store/store";

export interface PendingRemoteChangeState {
  changedIds: string[];
  needsFullRefresh: boolean;
  rescanMatchByName: boolean;
  displayModeChanged: boolean;
}

export class RemoteChangeBuffer {
  private readonly changedIds = new Set<string>();
  private rescanMatchByName = false;
  private needsFullRefresh = false;
  private displayModeChanged = false;

  public queue(change: UserStoreChange) {
    if (change.type === "displayMode") {
      this.displayModeChanged = true;
      return;
    }

    if (change.type !== "users") return;

    this.rescanMatchByName ||= Boolean(change.rescanMatchByName);

    if (!change.changedIds || change.changedIds.length === 0) {
      this.needsFullRefresh = true;
      return;
    }

    change.changedIds.forEach((id) => {
      if (id) this.changedIds.add(id);
    });
  }

  public consume(): PendingRemoteChangeState | null {
    if (
      !this.needsFullRefresh &&
      this.changedIds.size === 0 &&
      !this.rescanMatchByName &&
      !this.displayModeChanged
    ) {
      return null;
    }

    const snapshot: PendingRemoteChangeState = {
      changedIds: Array.from(this.changedIds),
      needsFullRefresh: this.needsFullRefresh,
      rescanMatchByName: this.rescanMatchByName,
      displayModeChanged: this.displayModeChanged,
    };

    this.changedIds.clear();
    this.rescanMatchByName = false;
    this.needsFullRefresh = false;
    this.displayModeChanged = false;

    return snapshot;
  }
}
