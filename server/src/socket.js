// Socket.io: one global io instance. Routes call emitBoard()/emitTeam()
// after a successful mutation, so every open board/team page updates
// live with no refresh. Clients join room `team:<teamId>` for team pages.
let io = null;
function initSocket(httpServer, corsOrigin) {
  const { Server } = require('socket.io');
  io = new Server(httpServer, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });
  io.on('connection', (socket) => {
    socket.on('join-team', (teamId) => { if (typeof teamId === 'string') socket.join(`team:${teamId}`); });
    socket.on('leave-team', (teamId) => { if (typeof teamId === 'string') socket.leave(`team:${teamId}`); });
  });
  return io;
}
function emitBoard(payload) {
  try { require('./routes/board').clearBoardCache(); } catch { /* board route not loaded yet */ }
  if (io) io.emit('board:update', payload);
}
function emitTeam(teamId, payload) { if (io) io.to(`team:${String(teamId)}`).emit('team:update', payload); }
module.exports = { initSocket, emitBoard, emitTeam };
