<script setup>
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

const emit = defineEmits(['signed-in'])

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const isSignUp = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    if (isSignUp.value) {
      const { error: err } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (err) throw err
    }
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (err) throw err
    emit('signed-in', data.user)
  } catch (err) {
    error.value = err.message || 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <h2>{{ isSignUp ? 'Create Account' : 'Sign In' }}</h2>
    <form @submit.prevent="handleSubmit">
      <input
        v-model="email"
        type="email"
        placeholder="Email"
        required
        autocomplete="email"
      />
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        required
        minlength="8"
        autocomplete="current-password"
      />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In' }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="toggle">
      {{ isSignUp ? 'Already have an account?' : "Don't have an account?" }}
      <a href="#" @click.prevent="isSignUp = !isSignUp">
        {{ isSignUp ? 'Sign in' : 'Sign up' }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.auth {
  max-width: 360px;
  margin: 60px auto;
}
h2 {
  margin-bottom: 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}
button {
  padding: 10px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  color: #dc2626;
  margin-top: 8px;
  font-size: 14px;
}
.toggle {
  margin-top: 16px;
  font-size: 14px;
  color: #666;
}
.toggle a {
  color: #2563eb;
}
</style>
