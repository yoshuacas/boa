#!/usr/bin/env bash
#
# tmux-agents.sh — Launch 5 Claude Code agents in a single tmux session
#
# ┌─────────────┬─────────────┐
# │  Agent 1    │  Agent 2    │
# ├─────────────┼─────────────┤
# │  Agent 3    │  Agent 4    │
# ├─────────────┴─────────────┤
# │         Agent 5           │
# └───────────────────────────┘
#
# USAGE:
#   chmod +x tmux-agents.sh
#   ./tmux-agents.sh
#
# INTERACTING:
#   Click on any pane or use Ctrl-b + arrow keys to switch between agents.
#   Each pane is an independent Claude Code session you can type into.
#
# DETACH (leave session running in background):
#   Ctrl-b  then  d
#
# REATTACH (reconnect to the running session):
#   tmux attach -t claude-agents
#
# LIST SESSIONS:
#   tmux ls
#
# KILL SESSION (stop all agents):
#   tmux kill-session -t claude-agents
#
# ZOOM INTO ONE PANE (toggle fullscreen on a single agent):
#   Ctrl-b  then  z       (press again to unzoom)
#
# SCROLL UP IN A PANE:
#   Ctrl-b  then  [       (then use arrow keys / PgUp; press q to exit scroll mode)
#

SESSION="claude-agents"
CLAUDE_CMD="${CLAUDE_CMD:-claude --dangerously-skip-permissions}"

# Kill existing session if present
tmux kill-session -t "$SESSION" 2>/dev/null

# Create session with first agent
tmux new-session -d -s "$SESSION" -x "$(tput cols)" -y "$(tput lines)" "$CLAUDE_CMD"

# Split into a 2x2 grid + bottom row
tmux split-window -t "$SESSION" -h "$CLAUDE_CMD"       # pane 1 (right of 0)
tmux split-window -t "$SESSION:0.0" -v "$CLAUDE_CMD"   # pane 2 (below 0)
tmux split-window -t "$SESSION:0.1" -v "$CLAUDE_CMD"   # pane 3 (below 1)
tmux split-window -t "$SESSION:0.2" -v "$CLAUDE_CMD"   # pane 4 (bottom full-width)

# Even out the layout
tmux select-layout -t "$SESSION" tiled

# Enable mouse support so you can click between panes
tmux set-option -t "$SESSION" mouse on

# Attach
tmux attach -t "$SESSION"
