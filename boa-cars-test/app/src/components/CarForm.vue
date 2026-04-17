<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  car: { type: Object, default: null },
})

const emit = defineEmits(['save', 'cancel'])

const make = ref('')
const model = ref('')
const year = ref(new Date().getFullYear())
const color = ref('')
const mileage = ref(null)
const notes = ref('')

watch(
  () => props.car,
  (c) => {
    if (c) {
      make.value = c.make || ''
      model.value = c.model || ''
      year.value = c.year || new Date().getFullYear()
      color.value = c.color || ''
      mileage.value = c.mileage || null
      notes.value = c.notes || ''
    } else {
      make.value = ''
      model.value = ''
      year.value = new Date().getFullYear()
      color.value = ''
      mileage.value = null
      notes.value = ''
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit('save', {
    make: make.value,
    model: model.value,
    year: year.value,
    color: color.value || null,
    mileage: mileage.value || null,
    notes: notes.value || null,
  })
}
</script>

<template>
  <form class="car-form" @submit.prevent="handleSubmit">
    <h3>{{ car ? 'Edit Car' : 'Add Car' }}</h3>
    <div class="row">
      <input v-model="make" placeholder="Make (e.g. Toyota)" required />
      <input v-model="model" placeholder="Model (e.g. Camry)" required />
    </div>
    <div class="row">
      <input v-model.number="year" type="number" placeholder="Year" required min="1900" max="2030" />
      <input v-model="color" placeholder="Color" />
    </div>
    <div class="row">
      <input v-model.number="mileage" type="number" placeholder="Mileage" min="0" />
    </div>
    <textarea v-model="notes" placeholder="Notes (maintenance, mods, etc.)" rows="2" />
    <div class="actions">
      <button type="submit">{{ car ? 'Update' : 'Add Car' }}</button>
      <button type="button" class="secondary" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.car-form {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}
h3 {
  margin: 0 0 12px;
}
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.row input {
  flex: 1;
}
input, textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}
textarea {
  margin-bottom: 8px;
  resize: vertical;
}
.actions {
  display: flex;
  gap: 8px;
}
button {
  padding: 8px 16px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
button.secondary {
  background: #e2e8f0;
  color: #334155;
}
</style>
