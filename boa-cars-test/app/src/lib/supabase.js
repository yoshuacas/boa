import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://dm2yob87lihft.cloudfront.net',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InBncmVzdC1sYW1iZGEiLCJleHAiOjIwOTE1Nzk2MjAsImlhdCI6MTc3NjIxOTYyMH0.4NnH2KLuRTljT6ob3f4K_v6E41ieXpSHTA56AaQbHSQ'
)
