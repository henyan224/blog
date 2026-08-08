from pathlib import Path
p = Path(r"D:\github\AI_project\blog\src\content\blog\ai-agent\agent-ep02-telegram-adapter.md")
s = p.read_text(encoding="utf-8")
body = s.split("---\n", 2)[2]
print("replacement_chars:", body.count("\ufffd"))
print("question_marks:", body.count("?"))
try:
    recovered = body.encode("cp936").decode("utf-8")
    print("conversion_success")
    print(recovered[:300])
except Exception as exc:
    print("conversion_failed:", repr(exc))
    for n, line in enumerate(body.splitlines(), 1):
        try:
            line.encode("cp936")
        except UnicodeEncodeError as error:
            print("unencodable_line", n, repr(line[:100]), error)
