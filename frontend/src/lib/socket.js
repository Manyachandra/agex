import { io } from 'socket.io-client'

export const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
})

socket.on('connect_error', (err) => {
  console.log('Socket connection failed:', err.message)
})
