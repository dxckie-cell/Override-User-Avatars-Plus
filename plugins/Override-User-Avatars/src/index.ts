import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

export { default as settings } from "./settings";

type Override = { id: string; url: string };

let unpatches: (() => void)[] = [];

// read at call time so edits in settings apply without reloading
const getOverrideUrl = (id?: string): string | undefined =>
    id
        ? (storage.overrides as Override[]).find(o => o.id?.trim() === id && o.url?.trim())?.url.trim()
        : undefined;

export function onLoad(): void {
    if (!Array.isArray(storage.overrides)) storage.overrides = [];

    // migrate the old single-user settings
    if (storage.targetUserId && storage.imageUrl) {
        storage.overrides = [...storage.overrides, { id: storage.targetUserId, url: storage.imageUrl }];
    }
    delete storage.targetUserId;
    delete storage.imageUrl;

    const avatars = findByProps("getUserAvatarURL");
    if (!avatars) return;

    // DMs and group chats
    const { getUserAvatarSource, getUserAvatarURL } = avatars;
    if (getUserAvatarSource) {
        avatars.getUserAvatarSource = function (...args) {
            const original = getUserAvatarSource.apply(this, args);
            const uri = getOverrideUrl(args[0]?.id);
            return uri && original ? { ...original, uri } : original;
        };
        unpatches.push(() => (avatars.getUserAvatarSource = getUserAvatarSource));
    }

    // voice calls
    avatars.getUserAvatarURL = function (...args) {
        return getOverrideUrl(args[0]?.id) ?? getUserAvatarURL.apply(this, args);
    };
    unpatches.push(() => (avatars.getUserAvatarURL = getUserAvatarURL));

    // refresh the UI for every overridden user
    const UserStore = findByStoreName("UserStore");
    for (const { id } of storage.overrides as Override[]) {
        try {
            const user = UserStore?.getUser(id?.trim());
            if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
        } catch (e) {}
    }
}

export function onUnload(): void {
    unpatches.forEach(unpatch => unpatch());
    unpatches = [];
}
