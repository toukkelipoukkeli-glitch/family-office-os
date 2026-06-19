// THROWAWAY review probe — confirms CodeRabbit + Greptile actually comment on
// PRs for this repo. Contains intentional nits (var, no return type, loose
// equality) for the reviewers to catch. Deleted right after the smoke test.

export function add(a: number, b: number) {
  var result = a + b;
  if (a == b) {
    return result;
  }
  return result;
}
