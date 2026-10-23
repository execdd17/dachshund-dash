#!/usr/bin/env bash
# Train on another machine with more cores: copy this tree there (uncommitted
# changes included), start train.mjs detached (a dropped connection doesn't
# stop it), wait for it, then copy the model and its results back and rebuild
# models/index.json here. Takes train.mjs's arguments.
#
#   AI_REMOTE=user@host ai/remote-train.sh --tier 5 --minutes 60 --from ai/models/tier4-from-tier3.json --name tier5-from-tier4
#
# The remote needs rsync and Node (the version here: the same seeds give the
# same results), on its PATH or in ~/.local/bin. The tree goes to
# ~/dachshund-dash there, replaced on every run, so run one job at a time.
# It checks on the job every AI_POLL_SECONDS (30).

set -euo pipefail
: "${AI_REMOTE:?set AI_REMOTE=user@host}"
root=$(cd "$(dirname "$0")/.." && pwd)

# The model's name, as train.mjs will choose it.
name='' tier=''
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --name) name=${args[i + 1]} ;;
    --tier) tier=${args[i + 1]} ;;
  esac
done
name=${name:-tier$tier}

rsync -a --delete --exclude .git --exclude node_modules "$root/" "$AI_REMOTE:dachshund-dash/"
pid=$(ssh "$AI_REMOTE" "cd ~/dachshund-dash && mkdir -p ai/results/$name && PATH=~/.local/bin:\$PATH \
  nohup node ai/train.mjs $(printf '%q ' "$@") > ai/results/$name/train.log 2>&1 < /dev/null & echo \$!")
echo "training $name on $AI_REMOTE (pid $pid)"

# Wait it out; a check that can't reach the remote just tries again later.
while :; do
  sleep ${AI_POLL_SECONDS:-30}
  status=$(ssh -o ConnectTimeout=10 "$AI_REMOTE" "kill -0 $pid 2>/dev/null && echo running || echo done" 2>/dev/null || echo unreachable)
  [[ $status == done ]] && break
done

rsync -a "$AI_REMOTE:dachshund-dash/ai/models/$name.json" "$root/ai/models/"
rsync -a "$AI_REMOTE:dachshund-dash/ai/results/$name/" "$root/ai/results/$name/"
node "$root/ai/model-index.mjs" > /dev/null
tail -1 "$root/ai/results/$name/train.log"
