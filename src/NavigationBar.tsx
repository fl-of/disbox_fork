import { Container, Nav, Navbar } from 'react-bootstrap';
import { Link } from 'react-router-dom';

function NavigationBar() {
  return (
    <Navbar bg="dark" variant="dark" expand="md" className="font" collapseOnSelect>
      <Container fluid>
        <Navbar.Brand as={Link} to="/">
          <b style={{ fontSize: '1.3rem' }}>Disbox</b>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-navbar" />
        <Navbar.Collapse id="main-navbar">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/home">
              Home
            </Nav.Link>
            <Nav.Link as={Link} to="/setup">
              Setup
            </Nav.Link>
          </Nav>
          <Nav className="ms-auto">
            <Nav.Link
              href="https://github.com/fl-of/disbox_fork/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code
            </Nav.Link>
            <Nav.Link
              href="https://github.com/fl-of/disbox_fork/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report issues
            </Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavigationBar;
