<script setup>
import { ref, onMounted } from 'vue'
import { boa } from './lib/boa'
import Auth from './components/Auth.vue'
import CarForm from './components/CarForm.vue'
import CarList from './components/CarList.vue'

const user = ref(null)
const cars = ref([])
const showForm = ref(false)
const editingCar = ref(null)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  const { user: currentUser } = await boa.auth.getUser()
  if (currentUser) {
    user.value = currentUser
    await fetchCars()
  }
})

async function fetchCars() {
  loading.value = true
  const { data, error: err } = await boa
    .from('cars')
    .select('*')
    .order('created_at', { ascending: false })
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  cars.value = data
}

async function handleSignedIn(u) {
  user.value = u
  await fetchCars()
}

async function handleSignOut() {
  await boa.auth.signOut()
  user.value = null
  cars.value = []
}

function startAdd() {
  editingCar.value = null
  showForm.value = true
}

function startEdit(car) {
  editingCar.value = car
  showForm.value = true
}

async function handleSave(carData) {
  error.value = ''
  if (editingCar.value) {
    const { error: err } = await boa
      .from('cars')
      .update(carData)
      .eq('id', editingCar.value.id)
    if (err) {
      error.value = err.message
      return
    }
  } else {
    const { error: err } = await boa
      .from('cars')
      .insert({ ...carData, user_id: user.value.id })
    if (err) {
      error.value = err.message
      return
    }
  }
  showForm.value = false
  editingCar.value = null
  await fetchCars()
}

async function handleDelete(car) {
  if (!confirm(`Delete ${car.year} ${car.make} ${car.model}?`)) return
  const { error: err } = await boa
    .from('cars')
    .delete()
    .eq('id', car.id)
  if (err) {
    error.value = err.message
    return
  }
  await fetchCars()
}

function handleCancel() {
  showForm.value = false
  editingCar.value = null
}
</script>

<template>
  <Auth v-if="!user" @signed-in="handleSignedIn" />
  <div v-else class="app">
    <header>
      <div>
        <h1>My Garage</h1>
        <p class="subtitle">{{ user.email }}</p>
      </div>
      <div class="header-actions">
        <button class="primary" @click="startAdd">+ Add Car</button>
        <button class="secondary" @click="handleSignOut">Sign Out</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <CarForm
      v-if="showForm"
      :car="editingCar"
      @save="handleSave"
      @cancel="handleCancel"
    />

    <p v-if="loading" class="loading">Loading...</p>
    <CarList
      v-else
      :cars="cars"
      @edit="startEdit"
      @delete="handleDelete"
    />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1e293b;
  background: #f8fafc;
}
</style>

<style scoped>
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 16px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
h1 {
  font-size: 24px;
}
.subtitle {
  font-size: 13px;
  color: #64748b;
}
.header-actions {
  display: flex;
  gap: 8px;
}
button.primary {
  padding: 8px 16px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
button.secondary {
  padding: 8px 16px;
  background: #e2e8f0;
  color: #334155;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.error {
  color: #dc2626;
  margin-bottom: 16px;
  font-size: 14px;
}
.loading {
  text-align: center;
  color: #94a3b8;
  padding: 40px;
}
</style>
