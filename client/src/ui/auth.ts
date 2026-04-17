import { BoaClient } from '../client.js'

const STYLE = `
:host {
  display: block;
  font-family: var(--boa-font-family, system-ui, sans-serif);
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
}
input {
  padding: 8px 12px;
  border: 1px solid var(--boa-input-border, #d1d5db);
  border-radius: var(--boa-border-radius, 6px);
  font-size: 14px;
  font-family: inherit;
}
input:focus {
  outline: 2px solid var(--boa-primary-color, #2563eb);
  outline-offset: -1px;
}
button[type="submit"] {
  padding: 8px 16px;
  background: var(--boa-primary-color, #2563eb);
  color: #fff;
  border: none;
  border-radius: var(--boa-border-radius, 6px);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
}
.toggle {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}
.toggle a {
  color: var(--boa-primary-color, #2563eb);
  cursor: pointer;
  text-decoration: none;
}
.error {
  color: var(--boa-error-color, #dc2626);
  font-size: 13px;
  margin: 0;
}
`

export class BoaAuthElement extends HTMLElement {
  static observedAttributes = ['api-url', 'anon-key']

  client: BoaClient | null = null

  private _mode: 'signin' | 'signup' = 'signin'
  private _root: ShadowRoot | null = null

  connectedCallback(): void {
    if (!this.client) {
      const apiUrl = this.getAttribute('api-url')
      const anonKey = this.getAttribute('anon-key')
      if (apiUrl && anonKey) {
        this.client = new BoaClient(apiUrl, anonKey)
      }
    }

    this._root = this.attachShadow({ mode: 'open' })
    this._render()
  }

  private _render(): void {
    if (!this._root) return

    const isSignIn = this._mode === 'signin'

    this._root.innerHTML = `<style>${STYLE}</style>
<form>
  <input type="email" placeholder="Email" required />
  <input type="password" placeholder="Password" required />
  <button type="submit">${isSignIn ? 'Sign in' : 'Sign up'}</button>
  <p class="toggle">
    ${isSignIn ? "Don't have an account?" : 'Already have an account?'}
    <a href="#">${isSignIn ? 'Sign up' : 'Sign in'}</a>
  </p>
  <p class="error" hidden></p>
</form>`

    const form = this._root.querySelector('form')!
    const toggle = this._root.querySelector('.toggle a')!

    form.addEventListener('submit', (e) => this._onSubmit(e))
    toggle.addEventListener('click', (e) => {
      e.preventDefault()
      this._mode = isSignIn ? 'signup' : 'signin'
      this._render()
    })
  }

  private async _onSubmit(e: Event): Promise<void> {
    e.preventDefault()
    if (!this.client || !this._root) return

    const form = e.target as HTMLFormElement
    const email = (
      form.querySelector('input[type="email"]') as HTMLInputElement
    ).value
    const password = (
      form.querySelector('input[type="password"]') as HTMLInputElement
    ).value

    const errorEl =
      this._root.querySelector('.error') as HTMLElement

    const result =
      this._mode === 'signin'
        ? await this.client.auth.signIn({ email, password })
        : await this.client.auth.signUp({ email, password })

    if (result.error) {
      errorEl.textContent = result.error.message
      errorEl.hidden = false
      this.dispatchEvent(
        new CustomEvent('boa-auth-error', {
          detail: { error: result.error },
          bubbles: true,
          composed: true,
        })
      )
      return
    }

    errorEl.hidden = true
    this.dispatchEvent(
      new CustomEvent('boa-auth-success', {
        detail: {
          user: result.user,
          session: result.session,
        },
        bubbles: true,
        composed: true,
      })
    )
  }
}

customElements.define('boa-auth', BoaAuthElement)
