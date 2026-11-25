# CampusConnect

A web app that helps students find study books, search millions of titles, filter them by university departments, read or download books, see ratings and keep a personal reading list.

- **Live app (load balancer):** https://www.umurerwa.tech 
- **Demo Video:** `https://go.screenpal.com/watch/cOXTQmn47YK`


---

## Features

- **Search** books by title, author or subject(Open Library API).
- **Sort** by relevance, newest, oldest or department.
- **Filter** by department (10 options), cover image, or full text available.
- **Read & Download** free public-domain books (Internet archive) , or **Borrow Free** on open Library.
- **Details** with description, ratings and book publisher (Google Books API).
- **Rading List** saved in the browser (`local storage`) with a live counter.
- **Light/ Dark Mode** and an African inspired Design. 
- **Clear Messages** for loading, errors and a missing API key

**Bonus Tasks:**
- **Caching** search results and book details are saved in `sessionStorage`, so repeat searches Load instantly.
- **Security** user input is validated, all API data is shown with `textContent` (never `innerHTML`) to block XSS attacks, and the Google Books Key is never exposed.

---

## APIs used

| API | What it does | Key needed? |
|---|---|---|
| [Open Library Search](https://openlibrary.org/dev/docs/api/search) | Book search | No |
| [Open Library Covers](https://openlibrary.org/dev/docs/api/covers) | Cover images | No |
| [Internet Archive](https://archive.org/developers/) | Online reader, PDF downloads | No |
| [Google Books](https://developers.google.com/books/docs/v1/using) | Ratings, descriptions, pages | **Yes**|

**API key and login:** the Google Books key is **not in the repository**. Graders receive it in the Canvas Submission comment. The App has no user  accounts, so there is no login details.

**How the key is kept safe**
- **Locally:** the key lives in `js/config.js`, which `.gitignore` keeps out of GitHub.
- **On The Servers:** Nginxadds the key on teh server side, so it never reaches the browser.
- **In the Google Cloud:** The key is restricted to the  books API only.

---

##  Project Files

```text
index.html           Page Structure
css/styles.css       All styling(Light + Dark Themes)
images/              African Pattern SVGs
js/themes.js         Light/Dark mode switch
js/api.js            Open Library search, validation , caching, departments
js/storage.js        Reading list (localStorage)
js/googleBooks.js    Google Books Details(secure key handling)
js/app.js            Draws the pages and handles the clicks, sorting and filtering
js/config.example.js  Template for my local API key
```

---

## Running it locally

1. Install VsCode and the Live Server Extension
2. Clone the Github repository using the link above and open the folder in Vs Cose
3. **Add the Google Book Key:** make a copy of `config.example.js`, name it config.js and insert the real API_KEY
4. Right Click on index.html and then Open with LiveServer

without config.js, everything work perfectly fine except button details

**Getting a free google Bookskey:** go to [console.cloud.google.com](https://console.cloud.google.com/), create a project, enable **Books API** (APIs & Services , then Library), then create a key (Credentials, Create credentials, API key) and restrict it to **Books API**

---

##  Deployment (Web01 + Web02 behind Lb01)

1. **User Request:** A user accesses `www.umurerwa.tech` over **HTTPS**
2. **Load Balancer(`Lb01`):** Traffic hits the **HAProxy** Load Balancer (`7418-lb-01` at `18.134.240.221`).
3. **Traffic Distribution:** Using **round-robin** load balancing, requests are routed evenly across two nginx **Ngix** web servers:
* **Web01:** `7418-lb-01` (`13.40.2.131`)
* **Web02:** `7418-lb-02` (`13.40.178.220`)

The app is  static (HTML, CSS, JS), so each web server only needs Nginx to serve the files. Both  servers hold identical copies. Searching happens in the visitor's browser and the reading list is stored in the browser, so users get the same experience whichever the server answers

### Web servers do this on Web01 and then on Web02

```bash
ssh -i ~/.ssh/school ubuntu@13.40.2.131       #Web02: ubuntu@13.40.178.220
sudo apt update && sudo apt install -y nginx git nano
git clone https://github.com/rosette1818/campus_connect.git ~/campus_connect
sudo  cp -r ~/campus_connect/index.html ~/campus_connect/css ~/campus_connect/js ~/campus_connect/images /var/www/html/
```

Save Google Books Key in a file only root can Read

```bash
echo 'set $google_books_key "PASTE_THE_KEY";' | sudo tee /etc/nginx/snippets/google-books-key.conf >
/dev/null
sudo chmod 600 /etc/nginx/snippets/google-books-key.conf
```
Open the config with `sudo nano /etc/nginx/sites-available/default` and add these lines **inside** the ` server {...}` block:

```nginx
    add_header X-Served-By $hostname always;     #shows which server answered
      
     location /api/google-books {
        limit_except GET { deny all;}
        include /etc/nginx/snippets/google-book-key-conf;
        resolver 8.8.8.8.1.1.1.1 valid=300s;
        proxy_pass https://www.googleapis.com/books/v1/volumes?$args&key=$google_books_key;
        proxy_ssl_server_name on;
        proxy_set-header Host www.googleapis.com;
     }
```
What these lines do:
-**`add_header X-Served_By $hostname`** adds the server's name to every response, which lets us prove the loud balancer uses both servers.
-**`location /api/google-books`** the browser calls this adress on our own server, and Nginx forwards the requests to Google with the secret key added. Visitors never see the key.
-**`limit_except GET`** only allows  reading, and **`resolver`** lets Nginx look up Google's adress.

Test the config for mistakes, the reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI http://localhost | grep -i x-served-by
```

### 2. Load Balancer: on Lb01

```bash
ssh -i ~/ssh/school ubuntu@18.134.240.221
sudo apt update && sudo apt install -y haproxy
sudo nano /etc/haproxy/haproxy.cfg
```

The mmain parts of `/etc/haproxy/haproxy.cfg`:

```haproxy

frontend http_front
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }

frontend https_front
    bind *:443 ssl crt /etc/haproxy/certs/www.umurerwa.tech.pem
    http-request add-header X-forwaded-Proto https
    default_backend web_servers    

backend web_servers
    balance roundrobin
    server 7418-web-01 13.40.131.80 check
    server 7418-web-02 13.40.178-220.80 check
```

What this does:

-**`http_front`** catches visitors on port 80 (`http://`) and redirects them to secure `https://` version.
-**`https_front`** handles secure traffic on port 443 using the SSL certificate for `www.umurerwa.tech`.
-**`backend web_servers`** lists the two web servers.
-**`balance roundrobin`** sends requests to Web01 and Web02 in turn.
-**`check`** makes HAProxy test each server regularly. If one goes down, all traffic goes to the other, so the site stays online.

Check the config for the mistakes and restart:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg && sudo systemctl restart haproxy
```

### 3. Testing

**Traffic is shared between both servers.** Run this 4 times through the load balancer:

```bash
for i in 1 2 3 4; do curl -sI https://www.umurerwa.tech | grep -i x-served-by; done
```

Result:

```text
x-served-by: 7418-web-01
x-served-by: 7418-web-02
x-served-by: 7418-web-01
x-served-by: 7418-web-02
```

**The app works through the load balancer.** Open https://www.umurerwa.tech and checks:

| Test | Result |
|---|---|
| Search, sort and filter books | Yes |
| Save to reading list, refresh the page, still saved | Yes |
| Read & Download a free book | Yes |
| Details loads (key added by Nginx, no `key=` in DevTools then Network) | Yes |

**The state survives a server going down.** Run `sudo systemctl stop nginx` on Web01. The site still works through the load balancer, and every response now says Web02. Turn Web01 on with `sudo systemctl start nginx`.

**To update the site later**, run this each web server:

```bash
cd ~/campus_connect && git pull && sudo cp -r index.html css js images /var/www/html/
```

---

## Challenges & solutions

1. **Keeping the API key secret in a browser app.** Any key in Javascript is visible to visitors. *Solution:* Nginx adds the key on the server side, and locally the key lives in a git-ignored file.
2. **Unsafe data from APIs (XSS).** *Solution:* every card is built with `createElement` and `textContent`, so a book title containing code shows a plain text.
3. **Missing or messy data.** Some books have no cover, author or year. *Solution* each field is checked, and books with no cover get  a styled placeholder.
4. **PDF links returning 404.** Archive.org doesn't always name  a book's PDF `<id>.pdf`. *Solution:* the app asks the Internet archive metadata API for the real file name, and falls back to the download page.
5. **No "department" field in the API.** *Solution:* a keyword map turns each book's subjects into 10 university departments.
6. **Proving the load balancer works.** *Solution:* an `X-Served-By` header shows which server answer each request.

---

### Credits

- [Open Library](https://openlibrary.org/) and the [Internet Archive](https://archive.org/): book data, covers, reader and downloads.
- [Google Books API](https://developers.google.com/books): ratings, description and page counts.
- [Nginx](https://nginx.org) and [HAProxy](https://www.haproxy.org/): web servers and page counts.
- [MDN Web Docs](https://developer.mozilla.org/): JavaScript reference.

**Author:** Rosette Umurerwa





