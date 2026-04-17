import type { BoaClient } from '../client.js'

const STYLE = `
:host {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--boa-font-family, system-ui, sans-serif);
}
.email {
  font-size: 14px;
}
.signout {
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--boa-input-border, #d1d5db);
  border-radius: var(--boa-border-radius, 6px);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
`

export class BoaUserMenuElement extends HTMLElement {
  client!: BoaClient

  private _root: ShadowRoot | null = null
  private _unsubscribe: (() => void) | null = null

  async connectedCallback(): Promise<void> {
    this._root = this.attachShadow({ mode: 'open' })

    const { user } = await this.client.auth.getUser()
    this._renderState(user?.email ?? null)

    const { unsubscribe } = this.client.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          this._renderState(session?.user?.email ?? null)
        } else if (event === 'SIGNED_OUT') {
          this._renderState(null)
        }
      }
    )
    this._unsubscribe = unsubscribe
  }

  disconnectedCallback(): void {
    this._unsubscribe?.()
    this._unsubscribe = null
  }

  private _renderState(email: string | null): void {
    if (!this._root) return

    if (!email) {
      this._root.innerHTML = ''
      return
    }

    this._root.innerHTML = `<style>${STYLE}</style>
<span class="email"></span>
<button class="signout">Sign out</button>`

    this._root.querySelector('.email')!.textContent = email
    this._root.querySelector('.signout')!.addEventListener(
      'click',
      () => this._onSignOut()
    )
  }

  private async _onSignOut(): Promise<void> {
    await this.client.auth.signOut()
    this._renderState(null)
    this.dispatchEvent(
      new CustomEvent('boa-signed-out', {
        bubbles: true,
        composed: true,
      })
    )
  }
}

customElements.define('boa-user-menu', BoaUserMenuElement)
