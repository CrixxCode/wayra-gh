import urllib.request
import json
import traceback

def main():
    data = json.dumps(
        {"email": "cristiandanrave@gmail.com", "base_url": "http://localhost:4200"}
    ).encode()
    req = urllib.request.Request(
        "http://localhost:8000/api/auth/password/reset/",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        response = urllib.request.urlopen(req)
        print("SUCCESS", response.status)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print("HTTP ERROR", e.code)
        try:
            err_json = json.loads(err_body)
            print(json.dumps(err_json, indent=2))
        except json.JSONDecodeError:
            print("HTML length:", len(err_body))
            with open("500_error_response.html", "w", encoding="utf-8") as f:
                f.write(err_body)
            print("Wrote to 500_error_response.html")
    except Exception as e:
        print(e)
        traceback.print_exc()


if __name__ == "__main__":
    main()
