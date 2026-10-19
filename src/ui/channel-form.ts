import { App, Modal } from "obsidian";

export class ChannelFormModal extends Modal {
	private url = "";
	private busy = false;
	private errorEl: HTMLElement | null = null;
	private saveBtn: HTMLButtonElement | null = null;

	constructor(app: App, private onSubmit: (url: string) => Promise<void>) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("youtube-tracker-form");

		contentEl.createEl("h3", { text: "Add channel" });
		contentEl.createEl("p", {
			text: "Paste a channel URL. Supported formats: /channel/ID, /@handle, /c/name, or /user/name.",
			cls: "setting-item-description",
		});

		const input = contentEl.createEl("input", {
			type: "text",
			placeholder: "https://www.youtube.com/@channel-name",
		});
		input.style.width = "100%";
		input.addEventListener("input", () => {
			this.url = input.value;
			this.clearError();
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				void this.handleSave();
			}
		});
		setTimeout(() => input.focus(), 50);

		this.errorEl = contentEl.createDiv({ cls: "youtube-tracker-error mod-warning" });
		this.errorEl.hide();

		const actions = contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = actions.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		this.saveBtn = actions.createEl("button", { text: "Add channel", cls: "mod-cta" });
		this.saveBtn.addEventListener("click", () => {
			void this.handleSave();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private clearError(): void {
		this.errorEl?.hide();
	}

	private showError(msg: string): void {
		if (this.errorEl) {
			this.errorEl.setText(msg);
			this.errorEl.show();
		}
	}

	private async handleSave(): Promise<void> {
		if (this.busy) return;
		const value = this.url.trim();
		if (!value) {
			this.showError("Enter a URL first.");
			return;
		}
		this.busy = true;
		this.saveBtn?.setText("Resolving…");
		this.saveBtn?.setAttr("disabled", "true");
		try {
			await this.onSubmit(value);
			this.close();
		} catch (e) {
			this.showError(e instanceof Error ? e.message : "Could not add the channel.");
		} finally {
			this.busy = false;
			this.saveBtn?.setText("Add channel");
			this.saveBtn?.removeAttribute("disabled");
		}
	}
}
