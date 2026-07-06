import { registerAddUserDialog } from "../add-user-dialog";
import {
  registerPanelBindings,
  registerPanelShell,
  registerPanelToggleBtn,
  registerPanelActions,
} from "./panel-core";
import { registerPanelSettings } from "./panel-settings";
import {
  registerUserCard,
  registerCopyableUid,
  registerAvatarEditor,
  registerMemoEditor,
  registerUidFixLink,
} from "./item-components";

let panelComponentsRegistered = false;

export function registerPanelComponents() {
  if (panelComponentsRegistered) return;
  panelComponentsRegistered = true;

  registerPanelBindings();
  registerAddUserDialog();
  registerPanelShell();
  registerPanelToggleBtn();
  registerPanelSettings();
  registerPanelActions();
  registerUserCard();
  registerCopyableUid();
  registerAvatarEditor();
  registerMemoEditor();
  registerUidFixLink();
}
