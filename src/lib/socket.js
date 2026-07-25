import { io } from 'socket.io-client'
import { API_BASE } from './config'

// Empty/undefined → current page origin (unified deploy + Vite proxy).
export const socket = io(API_BASE || undefined, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000,
})

socket.on('connect_error', (err) => {
  console.log('Socket connection failed:', err.message)
})
