<script setup>
defineProps({
  cars: { type: Array, required: true },
})
const emit = defineEmits(['edit', 'delete'])

function formatMileage(m) {
  return m != null ? m.toLocaleString() + ' mi' : '--'
}
</script>

<template>
  <div v-if="cars.length === 0" class="empty">
    No cars in your garage yet. Add one above!
  </div>
  <div v-else class="car-grid">
    <div v-for="car in cars" :key="car.id" class="car-card">
      <div class="car-header">
        <span class="car-title">{{ car.year }} {{ car.make }} {{ car.model }}</span>
        <span v-if="car.color" class="car-color" :style="{ background: car.color }" />
      </div>
      <div class="car-details">
        <span v-if="car.color">{{ car.color }}</span>
        <span>{{ formatMileage(car.mileage) }}</span>
      </div>
      <p v-if="car.notes" class="car-notes">{{ car.notes }}</p>
      <div class="car-actions">
        <button @click="emit('edit', car)">Edit</button>
        <button class="danger" @click="emit('delete', car)">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  color: #94a3b8;
  padding: 40px;
  font-size: 15px;
}
.car-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.car-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  background: white;
}
.car-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.car-title {
  font-weight: 600;
  font-size: 16px;
}
.car-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #ddd;
  flex-shrink: 0;
}
.car-details {
  font-size: 13px;
  color: #64748b;
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.car-notes {
  font-size: 13px;
  color: #475569;
  margin: 0 0 12px;
  line-height: 1.4;
}
.car-actions {
  display: flex;
  gap: 8px;
}
button {
  padding: 6px 12px;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
button.danger {
  color: #dc2626;
  border-color: #fecaca;
}
</style>
