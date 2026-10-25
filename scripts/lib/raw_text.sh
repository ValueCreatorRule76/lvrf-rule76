# P2 (LVRF_PLAN §10; P2-D5): a research response is posted as its TEXT,
# {"raw_text": "<the response, as pasted>"}; the server parses it and keeps it,
# hashed, in research_imports. asraw PATH BODY prints the body to send: a
# research-results parse gets its JSON wrapped as text; any other path, as is.
asraw() {
  case "$1" in
    */research-results) node -e 'process.stdout.write(JSON.stringify({ raw_text: process.argv[1] }))' "$2" ;;
    *) printf '%s' "$2" ;;
  esac
}
