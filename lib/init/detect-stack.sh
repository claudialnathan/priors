#!/usr/bin/env bash
# detect-stack.sh — emit stack / tooling signals from the current tree.
#
# Contract:
#   - KEY=VALUE lines on stdout, one per detected signal.
#   - Emits nothing when nothing is detected. Never fabricates.
#   - Exit 0 always; absence of a signal is data, not an error.
#
# Keys emitted (all optional):
#   stack, stack_source
#   package_manager, package_manager_source
#   typescript, typescript_strict, typescript_strict_source
#   node_version, node_version_source
#   monorepo, monorepo_type, workspace_members

set -uo pipefail

# --- stack + framework + typescript (via package.json) ----------------------

if [[ -f package.json ]]; then
  if command -v node >/dev/null 2>&1; then
    stack_line=$(node -e '
      try {
        const p = require("./package.json");
        const deps = Object.assign({}, p.dependencies||{}, p.devDependencies||{});
        const known = [
          ["next","Next.js"],["react","React"],["vue","Vue"],
          ["svelte","Svelte"],["astro","Astro"],["remix","Remix"],
          ["express","Express"],["fastify","Fastify"],["nestjs","NestJS"],
          ["@nestjs/core","NestJS"]
        ];
        let name=null, ver=null;
        for (const [k,v] of known) {
          if (deps[k]) { name=v; ver=(deps[k]||"").replace(/^[\^~]/,""); break; }
        }
        if (name) process.stdout.write(name + (ver ? " " + ver : ""));
      } catch(e) {}
    ' 2>/dev/null || true)
    if [[ -n "$stack_line" ]]; then
      echo "stack=$stack_line"
      echo "stack_source=package.json"
    fi

    ts=$(node -e '
      try {
        const p = require("./package.json");
        const deps = Object.assign({}, p.dependencies||{}, p.devDependencies||{});
        process.stdout.write(deps.typescript ? "true" : "");
      } catch(e) {}
    ' 2>/dev/null || true)
    if [[ "$ts" == "true" ]]; then
      echo "typescript=true"
    fi

    # .nvmrc wins if both are present — skip engines.node when .nvmrc exists.
    if [[ ! -f .nvmrc ]]; then
      nv=$(node -e '
        try {
          const p = require("./package.json");
          process.stdout.write(((p.engines||{}).node)||"");
        } catch(e) {}
      ' 2>/dev/null || true)
      if [[ -n "$nv" ]]; then
        echo "node_version=$nv"
        echo "node_version_source=package.json"
      fi
    fi
  else
    # Fallback grep — loses versions but preserves framework name.
    for key in next react vue svelte astro express fastify; do
      if grep -Eq "\"$key\"[[:space:]]*:" package.json 2>/dev/null; then
        case "$key" in
          next)     echo "stack=Next.js" ;;
          react)    echo "stack=React" ;;
          vue)      echo "stack=Vue" ;;
          svelte)   echo "stack=Svelte" ;;
          astro)    echo "stack=Astro" ;;
          express)  echo "stack=Express" ;;
          fastify)  echo "stack=Fastify" ;;
        esac
        echo "stack_source=package.json"
        break
      fi
    done
    if grep -Eq '"typescript"[[:space:]]*:' package.json 2>/dev/null; then
      echo "typescript=true"
    fi
  fi
elif [[ -f pyproject.toml ]]; then
  if grep -qiE '(^|")django' pyproject.toml 2>/dev/null; then
    echo "stack=Django"
  elif grep -qiE '(^|")fastapi' pyproject.toml 2>/dev/null; then
    echo "stack=FastAPI"
  elif grep -qiE '(^|")flask' pyproject.toml 2>/dev/null; then
    echo "stack=Flask"
  else
    echo "stack=Python project"
  fi
  echo "stack_source=pyproject.toml"
elif [[ -f Cargo.toml ]]; then
  echo "stack=Rust"
  echo "stack_source=Cargo.toml"
elif [[ -f go.mod ]]; then
  echo "stack=Go"
  echo "stack_source=go.mod"
fi

# --- package manager (lockfile wins) ----------------------------------------

if [[ -f pnpm-lock.yaml ]]; then
  echo "package_manager=pnpm"
  echo "package_manager_source=pnpm-lock.yaml"
elif [[ -f yarn.lock ]]; then
  echo "package_manager=yarn"
  echo "package_manager_source=yarn.lock"
elif [[ -f bun.lockb ]] || [[ -f bun.lock ]]; then
  echo "package_manager=bun"
  echo "package_manager_source=bun.lock"
elif [[ -f package-lock.json ]]; then
  echo "package_manager=npm"
  echo "package_manager_source=package-lock.json"
fi

# --- node version from .nvmrc overrides package.json engines ----------------

if [[ -f .nvmrc ]]; then
  nv=$(head -n 1 .nvmrc | tr -d '[:space:]')
  if [[ -n "$nv" ]]; then
    echo "node_version=$nv"
    echo "node_version_source=.nvmrc"
  fi
fi

# --- tsconfig strict --------------------------------------------------------

if [[ -f tsconfig.json ]]; then
  if grep -Eq '"strict"[[:space:]]*:[[:space:]]*true' tsconfig.json 2>/dev/null; then
    echo "typescript_strict=true"
    echo "typescript_strict_source=tsconfig.json"
  elif grep -Eq '"strict"[[:space:]]*:[[:space:]]*false' tsconfig.json 2>/dev/null; then
    echo "typescript_strict=false"
    echo "typescript_strict_source=tsconfig.json"
  fi
fi

# --- monorepo ---------------------------------------------------------------

if [[ -f pnpm-workspace.yaml ]]; then
  echo "monorepo=true"
  echo "monorepo_type=pnpm-workspace"
  members=$(grep -cE '^\s*-[[:space:]]' pnpm-workspace.yaml 2>/dev/null || echo 0)
  echo "workspace_members=$members"
elif [[ -f turbo.json ]]; then
  echo "monorepo=true"
  echo "monorepo_type=turbo"
elif [[ -f nx.json ]]; then
  echo "monorepo=true"
  echo "monorepo_type=nx"
elif [[ -f package.json ]] && grep -q '"workspaces"' package.json 2>/dev/null; then
  echo "monorepo=true"
  echo "monorepo_type=npm-workspaces"
fi

exit 0
