import { Button, Card } from "react-bootstrap";
import { Dialog, DialogActions, DialogContent, DialogTitle, Button as MuiButton } from '@mui/material';
import { useState } from 'react';
import { BiLogIn } from "react-icons/bi";
import { IoInfiniteSharp } from 'react-icons/io5';
import { MdLockOutline, MdMoneyOff, MdOutlineSpeed } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import './App.css';
import NavigationBar from './NavigationBar';

function isMobile() {
  let check = false;
  // eslint-disable-next-line
  (function (a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || window.opera);
  return check;
}

function Home() {
  const [showMobileDialog, setShowMobileDialog] = useState(isMobile());
  const navigate = useNavigate();
  const hasWebhook = Boolean(localStorage.getItem("webhookUrl"));

  return (
    <div style={{ minHeight: "100%" }}>
      <NavigationBar />

      <Dialog open={showMobileDialog}>
        <DialogTitle>Warning</DialogTitle>
        <DialogContent>
          Disbox is not currently optimized for mobile devices. For the best experience, use a desktop browser.
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setShowMobileDialog(false)}>Continue anyway</MuiButton>
        </DialogActions>
      </Dialog>

      <div className="App App-header">
        <div style={{ width: "100%", backgroundColor: "#2F3136", paddingBottom: "2rem" }}>
          <h1 style={{ fontSize: "6rem" }} className="mt-3"><b>Disbox</b></h1>
          <h1 style={{ fontSize: "2.2rem", maxWidth: 900, margin: "0 auto" }}>
            Cloud storage powered by Discord webhooks.
          </h1>
          <p style={{ maxWidth: 800, margin: "1rem auto 0", fontSize: "1.1rem", color: "#d1d5db" }}>
            Upload files, organize folders, and access your data through a simple web interface. Files are chunked to fit Discord limits and managed as a virtual file system.
          </p>
          <div className="m-4" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Button style={{ fontSize: "1.6rem", padding: "0.6rem 1.4rem" }} variant="primary" onClick={() => navigate(hasWebhook ? "/" : "/setup")}>
              <b>{hasWebhook ? "Open storage" : "Get started"}</b>
            </Button>
            <Button style={{ fontSize: "1.6rem", padding: "0.6rem 1.4rem" }} variant="secondary" onClick={() => navigate("/setup")}>
              <b>Setup / Change webhook</b>
            </Button>
            <Button style={{ fontSize: "1.6rem", padding: "0.6rem 1.4rem" }} variant="outline-light" onClick={() => window.open("https://github.com/DisboxApp/web", "_blank", "noopener,noreferrer")}>
              <b>Source code</b>
            </Button>
          </div>
        </div>

        <div style={{ textAlign: "left", backgroundColor: "#FFFFFF", width: "100%", display: "flex", justifyContent: "center", flexWrap: "wrap", padding: "2rem 1rem" }}>
          <Card bg="dark" text="white" style={{ width: '18rem', minHeight: '18rem' }} className="m-2">
            <Card.Header><MdMoneyOff /> Free</Card.Header>
            <Card.Body>
              <Card.Text style={{ fontSize: "1.05rem" }}>
                No subscriptions required. Use your own Discord server and webhook as the storage backend.
              </Card.Text>
            </Card.Body>
          </Card>
          <Card bg="dark" text="white" style={{ width: '18rem', minHeight: '18rem' }} className="m-2">
            <Card.Header><MdOutlineSpeed /> Fast</Card.Header>
            <Card.Body>
              <Card.Text style={{ fontSize: "1.05rem" }}>
                Parallel chunk uploads/downloads and a lightweight interface for browsing and managing files.
              </Card.Text>
            </Card.Body>
          </Card>
          <Card bg="dark" text="white" style={{ width: '18rem', minHeight: '18rem' }} className="m-2">
            <Card.Header><IoInfiniteSharp style={{ marginBottom: "0.2rem" }} /> Flexible</Card.Header>
            <Card.Body>
              <Card.Text style={{ fontSize: "1.05rem" }}>
                Store files of any size by splitting them into chunks. Organize content with folders and search.
              </Card.Text>
            </Card.Body>
          </Card>
          <Card bg="dark" text="white" style={{ width: '18rem', minHeight: '18rem' }} className="m-2">
            <Card.Header><BiLogIn style={{ marginRight: "0.2rem" }} /> Simple setup</Card.Header>
            <Card.Body>
              <Card.Text style={{ fontSize: "1.05rem" }}>
                Only a Discord webhook URL is needed. No separate Disbox account or password to manage.
              </Card.Text>
            </Card.Body>
          </Card>
          <Card bg="dark" text="white" style={{ width: '18rem', minHeight: '18rem' }} className="m-2">
            <Card.Header><MdLockOutline /> Your Discord, your data</Card.Header>
            <Card.Body>
              <Card.Text style={{ fontSize: "1.05rem" }}>
                Files are stored as Discord attachments via your webhook. Keep your webhook private and use a dedicated server.
              </Card.Text>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Home;
